//! keys.justworks server library.
//!
//! Stateless `ncryptsec` locker (see docs/design.md): stores/serves encrypted
//! key blobs behind `{ identifier_hash, password_secret }` auth. Never
//! decrypts, never signs. Auth is stateless — every handler re-verifies
//! `argon2(password_secret)` inline against the stored verifier; there are no
//! sessions or tokens. The client sends `scrypt(password)` as `password_secret`
//! (the raw password never reaches the server — see @kj/core); the server
//! applies argon2 on top, so the stored verifier is never the wire value.

use std::str::FromStr;
use std::sync::OnceLock;

use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use axum::extract::{Request, State};
use axum::http::{header, HeaderName, HeaderValue, StatusCode, Uri};
use axum::middleware::{from_fn, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use base64::{engine::general_purpose, Engine};
use rand_core::OsRng;
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use thiserror::Error;
use tower_http::trace::TraceLayer;

/// The static site produced by `packages/web` (`make build-web`), embedded at
/// compile time for a single deployable binary. A checked-in placeholder
/// `index.html` exists so this compiles before the web is ever built.
#[derive(RustEmbed)]
#[folder = "../packages/web/build/"]
struct WebAssets;

/// Server state: a SQLite connection pool. Cloned cheaply (pool is `Arc`d).
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
}

/// Connect to SQLite at `database_url` (e.g. `sqlite:keys.db`), enable WAL, and
/// run the schema bootstrap. Used by the binary; tests build their own pool.
pub async fn connect(database_url: &str) -> Result<SqlitePool, sqlx::Error> {
    let options = SqliteConnectOptions::from_str(database_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal);
    let pool = SqlitePoolOptions::new().connect_with(options).await?;
    init_schema(&pool).await?;
    Ok(pool)
}

/// Create the single `accounts` table if it does not exist.
/// ponytail: a `CREATE TABLE IF NOT EXISTS` on boot is enough for one table;
/// adopt `sqlx::migrate!` when there's a second migration or a schema change
/// that needs versioning.
pub async fn init_schema(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS accounts (
            identifier_hash   TEXT PRIMARY KEY,
            password_verifier TEXT NOT NULL,
            ncryptsec         TEXT NOT NULL,
            created_at        TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )"#,
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Build the application router with the given state.
pub fn app(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/register", post(register))
        .route("/api/login", post(login))
        .route("/api/blob", put(update_blob))
        .route("/api/account", delete(delete_account))
        .fallback(static_handler)
        .layer(TraceLayer::new_for_http())
        .layer(from_fn(security_headers))
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}

// --- request / response bodies ----------------------------------------------

#[derive(Deserialize)]
struct RegisterBody {
    identifier_hash: String,
    password_secret: String,
    ncryptsec: String,
}

#[derive(Deserialize)]
struct AuthBody {
    identifier_hash: String,
    password_secret: String,
}

#[derive(Deserialize)]
struct UpdateBlobBody {
    identifier_hash: String,
    password_secret: String,
    new_ncryptsec: String,
    /// Present only on a password change. The client must re-encrypt
    /// `new_ncryptsec` under the new passphrase (`identifier ‖ new_password`)
    /// and send `scrypt(new_password)` here as `new_password_secret` — the
    /// server cannot re-encrypt or re-derive either.
    #[serde(default)]
    new_password_secret: Option<String>,
}

#[derive(Serialize)]
struct NcryptsecResp {
    ncryptsec: String,
}

// --- errors ------------------------------------------------------------------

#[derive(Error, Debug)]
enum AppError {
    #[error("bad request: {0}")]
    BadRequest(&'static str),
    #[error("unauthorized")]
    Unauthorized,
    #[error("conflict")]
    Conflict,
    #[error("database error")]
    Database(#[from] sqlx::Error),
    #[error("password hash error: {0}")]
    Argon2(String),
}

impl From<argon2::password_hash::Error> for AppError {
    fn from(e: argon2::password_hash::Error) -> Self {
        // `password_hash::Error` doesn't impl `std::error::Error`, so it can't
        // be a thiserror `#[from]` source; stringify to keep the detail for logs.
        AppError::Argon2(e.to_string())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match self {
            AppError::BadRequest(msg) => return (StatusCode::BAD_REQUEST, msg).into_response(),
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::Conflict => StatusCode::CONFLICT,
            // Don't leak internal detail (DB / argon2 internals) to clients.
            AppError::Database(_) | AppError::Argon2(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, status.canonical_reason().unwrap_or("error")).into_response()
    }
}

// --- handlers ----------------------------------------------------------------

/// Store a new `{ identifier_hash, argon2(password_secret), ncryptsec }`. The
/// client sends `scrypt(password)` as `password_secret` (the raw password never
/// leaves it — see @kj/core); the server applies argon2 on top, so the stored
/// verifier is never the wire value. The server still owns argon2 — it never
/// trusts a client-supplied verifier.
async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterBody>,
) -> Result<StatusCode, AppError> {
    validate_hash(&body.identifier_hash)?;
    validate_secret(&body.password_secret)?;
    validate_ncryptsec(&body.ncryptsec)?;
    let verifier = hash_secret(&body.password_secret)?;

    let res = sqlx::query(
        "INSERT INTO accounts (identifier_hash, password_verifier, ncryptsec) VALUES (?, ?, ?)",
    )
    .bind(&body.identifier_hash)
    .bind(verifier)
    .bind(&body.ncryptsec)
    .execute(&state.db)
    .await;

    match res {
        Ok(_) => Ok(StatusCode::CREATED),
        Err(sqlx::Error::Database(e)) if e.is_unique_violation() => Err(AppError::Conflict),
        Err(e) => Err(e.into()),
    }
}

/// Verify `{ identifier_hash, password_secret }` and return the stored
/// `ncryptsec`. A missing account and a wrong secret are indistinguishable
/// (both 401): the response reveals nothing, and a dummy argon2 verify on the
/// missing path keeps the timing roughly equal.
async fn login(
    State(state): State<AppState>,
    Json(body): Json<AuthBody>,
) -> Result<Json<NcryptsecResp>, AppError> {
    validate_hash(&body.identifier_hash)?;
    validate_secret(&body.password_secret)?;

    let row =
        sqlx::query("SELECT password_verifier, ncryptsec FROM accounts WHERE identifier_hash = ?")
            .bind(&body.identifier_hash)
            .fetch_optional(&state.db)
            .await?;

    let Some(row) = row else {
        // ponytail: timing equalization, not a constant-time guarantee. The
        // real online brute-force defense (per-account/per-IP rate-limiting)
        // is deferred — argon2's slow verify is the floor throttle until then.
        let _ = verify_secret(&body.password_secret, dummy_verifier());
        return Err(AppError::Unauthorized);
    };

    let verifier: String = row.try_get("password_verifier")?;
    let ncryptsec: String = row.try_get("ncryptsec")?;

    if !verify_secret(&body.password_secret, &verifier)? {
        return Err(AppError::Unauthorized);
    }
    Ok(Json(NcryptsecResp { ncryptsec }))
}

/// Re-encrypt path: verify auth, then replace the blob. With
/// `new_password_secret`, also rotate the verifier (password change). Covers
/// both re-encrypt and password rotation in one atomic request.
async fn update_blob(
    State(state): State<AppState>,
    Json(body): Json<UpdateBlobBody>,
) -> Result<StatusCode, AppError> {
    validate_hash(&body.identifier_hash)?;
    validate_secret(&body.password_secret)?;
    validate_ncryptsec(&body.new_ncryptsec)?;

    authenticated_verifier(&state.db, &body.identifier_hash, &body.password_secret).await?;

    match body.new_password_secret {
        Some(new_password_secret) => {
            validate_secret(&new_password_secret)?;
            let new_verifier = hash_secret(&new_password_secret)?;
            sqlx::query(
                "UPDATE accounts SET password_verifier = ?, ncryptsec = ?, updated_at = datetime('now') WHERE identifier_hash = ?",
            )
            .bind(new_verifier)
            .bind(&body.new_ncryptsec)
            .bind(&body.identifier_hash)
            .execute(&state.db)
            .await?;
        }
        None => {
            sqlx::query(
                "UPDATE accounts SET ncryptsec = ?, updated_at = datetime('now') WHERE identifier_hash = ?",
            )
            .bind(&body.new_ncryptsec)
            .bind(&body.identifier_hash)
            .execute(&state.db)
            .await?;
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Verify auth, then delete the account.
async fn delete_account(
    State(state): State<AppState>,
    Json(body): Json<AuthBody>,
) -> Result<StatusCode, AppError> {
    validate_hash(&body.identifier_hash)?;
    validate_secret(&body.password_secret)?;
    authenticated_verifier(&state.db, &body.identifier_hash, &body.password_secret).await?;

    sqlx::query("DELETE FROM accounts WHERE identifier_hash = ?")
        .bind(&body.identifier_hash)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

// --- shared auth helper ------------------------------------------------------

/// Fetch the stored verifier for `identifier_hash` and confirm
/// `password_secret`. Used by every non-register mutating route. Returns
/// `Unauthorized` (with a dummy verify on the missing path) for both
/// missing-account and wrong-secret.
async fn authenticated_verifier(
    db: &SqlitePool,
    identifier_hash: &str,
    password_secret: &str,
) -> Result<(), AppError> {
    let row = sqlx::query("SELECT password_verifier FROM accounts WHERE identifier_hash = ?")
        .bind(identifier_hash)
        .fetch_optional(db)
        .await?;
    let Some(row) = row else {
        let _ = verify_secret(password_secret, dummy_verifier());
        return Err(AppError::Unauthorized);
    };
    let verifier: String = row.try_get("password_verifier")?;
    if !verify_secret(password_secret, &verifier)? {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

// --- crypto + validation helpers ---------------------------------------------

/// Argon2id (crate defaults: m=19456 KiB, t=2, p=1 — RFC 9106 first row) of the
/// client-derived `password_secret` (`scrypt(password)`). ponytail: defaults
/// are fine for now; tune memory/time before production load.
fn hash_secret(secret: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    Ok(Argon2::default()
        .hash_password(secret.as_bytes(), &salt)?
        .to_string())
}

fn verify_secret(secret: &str, verifier: &str) -> Result<bool, AppError> {
    let parsed = PasswordHash::new(verifier)?;
    Ok(Argon2::default()
        .verify_password(secret.as_bytes(), &parsed)
        .is_ok())
}

/// A valid argon2id verifier for a throwaway password, generated once per
/// process. Used on the missing-account path so the work roughly matches a real
/// verify, closing the obvious timing gap.
fn dummy_verifier() -> &'static str {
    static DUMMY: OnceLock<String> = OnceLock::new();
    DUMMY.get_or_init(|| {
        let salt = SaltString::generate(&mut OsRng);
        Argon2::default()
            .hash_password(b"keys.justworks-dummy-no-account", &salt)
            .expect("dummy argon2 hash of fixed input with default params")
            .to_string()
    })
}

/// 64 hex chars (32 bytes) — the shape the client produces for both
/// `identifier_hash` (`H(identifier)`) and `password_secret` (`scrypt(password)`).
fn is_hex64(s: &str) -> bool {
    s.len() == 64 && s.as_bytes().iter().all(|b| b.is_ascii_hexdigit())
}

/// `identifier_hash` is `H(identifier)`. Only validates the wire format the
/// client produces in `@kj/core`, never the identifier's strength (design:
/// disclose, never enforce).
fn validate_hash(h: &str) -> Result<(), AppError> {
    if is_hex64(h) {
        Ok(())
    } else {
        Err(AppError::BadRequest("identifier_hash must be 64 hex chars"))
    }
}

/// `password_secret` is the client-derived `scrypt(password)` (32 bytes). Only
/// validates the wire format — the server never sees the raw password.
fn validate_secret(s: &str) -> Result<(), AppError> {
    if is_hex64(s) {
        Ok(())
    } else {
        Err(AppError::BadRequest("password_secret must be 64 hex chars"))
    }
}

/// The server stores opaque blobs it never decrypts; a prefix check just rejects
/// obvious garbage early (client bug, not a security boundary).
fn validate_ncryptsec(s: &str) -> Result<(), AppError> {
    if s.starts_with("ncryptsec1") {
        Ok(())
    } else {
        Err(AppError::BadRequest(
            "ncryptsec must start with 'ncryptsec1'",
        ))
    }
}

// --- static site -------------------------------------------------------------

/// Serve an embedded asset by path; fall back to `index.html` for client-side
/// routing. Unknown paths 404.
async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    // Mime comes from the *resolved* asset path, not the request path: a direct
    // load of `/register` (or `/`) falls back to index.html, which must be served
    // as text/html — not guessed from "register" (no extension → octet-stream),
    // which our `nosniff` header would make the browser download instead of render.
    let (resolved, file) = match WebAssets::get(path) {
        Some(f) => (path, f),
        None => match WebAssets::get("index.html") {
            Some(f) => ("index.html", f),
            None => return (StatusCode::NOT_FOUND, "not found").into_response(),
        },
    };
    let mime = mime_guess::from_path(resolved)
        .first_or_octet_stream()
        .essence_str()
        .to_owned();
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, mime)],
        file.data.into_owned(),
    )
        .into_response()
}

// --- perimeter: CSP + security response headers -----------------------------

/// The `Content-Security-Policy` for the bundled site. `script-src` is `'self'`
/// plus a hash of SvelteKit's inline bootstrap loader (the inline `<script>`
/// SvelteKit emits), computed from the embedded `index.html` so it stays in sync
/// across rebuilds. Computed once and cached. See docs/design.md "Perimeter
/// defense". `connect-src` also allows the `wss:` scheme so the NIP-46 bunker
/// can reach user-chosen relays (the primary XSS defense remains
/// `script-src 'self'`; see docs/design.md "Perimeter defense").
fn csp_header() -> &'static str {
    static CSP: OnceLock<String> = OnceLock::new();
    CSP.get_or_init(build_csp)
}

fn build_csp() -> String {
    let mut script_src = String::from("'self'");
    for h in inline_script_hashes() {
        script_src.push_str(" 'sha256-");
        script_src.push_str(&h);
        script_src.push('\'');
    }
    format!(
        "default-src 'self'; script-src {script_src}; style-src 'self'; \
         img-src 'self'; font-src 'self'; connect-src 'self' wss:; object-src 'none'; \
         base-uri 'none'; frame-ancestors 'none'; form-action 'self'; \
         frame-src 'none'; manifest-src 'self'"
    )
}

/// SHA-256/base64 (per CSP hash-source) of every inline `<script>` body in the
/// embedded `index.html` (scripts without a `src`). External scripts are covered
/// by `'self'`; only inline ones need a hash. The browser hashes the exact bytes
/// between `>` and `</script>`, so we do too.
fn inline_script_hashes() -> Vec<String> {
    let Some(file) = WebAssets::get("index.html") else {
        return Vec::new();
    };
    let Ok(html) = std::str::from_utf8(&file.data) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut rest = html;
    while let Some(open) = rest.find("<script") {
        rest = &rest[open..];
        let Some(tag_end) = rest.find('>') else { break };
        let opening_tag = &rest[..tag_end]; // `<script` + attrs, no `>`
        let after = &rest[tag_end + 1..];
        let Some(close) = after.find("</script>") else {
            break;
        };
        if !opening_tag.contains("src") {
            out.push(general_purpose::STANDARD.encode(Sha256::digest(&after[..close])));
        }
        rest = &after[close + "</script>".len()..];
    }
    out
}

/// Apply security response headers to every response. CSP (with `frame-ancestors
/// 'none'` — works in a header, unlike a meta tag), plus the usual hardening.
async fn security_headers(req: Request, next: Next) -> Response {
    let mut res = next.run(req).await;
    let h = res.headers_mut();
    h.insert(
        HeaderName::from_static("content-security-policy"),
        HeaderValue::from_str(csp_header()).expect("csp is ascii"),
    );
    h.insert(
        HeaderName::from_static("x-content-type-options"),
        HeaderValue::from_static("nosniff"),
    );
    h.insert(
        HeaderName::from_static("referrer-policy"),
        HeaderValue::from_static("no-referrer"),
    );
    h.insert(
        HeaderName::from_static("x-frame-options"),
        HeaderValue::from_static("DENY"),
    );
    h.insert(
        HeaderName::from_static("cross-origin-opener-policy"),
        HeaderValue::from_static("same-origin"),
    );
    h.insert(
        HeaderName::from_static("permissions-policy"),
        // ponytail: block the obvious sensitive APIs we don't use; extend as the app grows.
        HeaderValue::from_static("camera=(), microphone=(), geolocation=(), payment=()"),
    );
    h.insert(
        HeaderName::from_static("strict-transport-security"),
        HeaderValue::from_static("max-age=31536000; includeSubDomains"),
    );
    res
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csp_shape_and_inline_script_hash() {
        let csp = csp_header();
        assert!(csp.contains("script-src 'self'"), "{csp}");
        assert!(csp.contains("style-src 'self'"), "{csp}");
        assert!(csp.contains("object-src 'none'"), "{csp}");
        assert!(csp.contains("base-uri 'none'"), "{csp}");
        assert!(csp.contains("frame-ancestors 'none'"), "{csp}");
        assert!(csp.contains("form-action 'self'"), "{csp}");
        // NIP-46 bunker needs wss: relay connections (user-chosen relay).
        assert!(csp.contains("connect-src 'self' wss:"), "{csp}");
        // When the embedded index.html has an inline <script> (i.e. the web is
        // built, not the placeholder), its hash must appear in script-src.
        if let Some(f) = WebAssets::get("index.html") {
            let html = std::str::from_utf8(&f.data).unwrap_or("");
            let has_inline = html.match_indices("<script").any(|(i, _)| {
                let rest = &html[i..];
                let Some(te) = rest.find('>') else {
                    return false;
                };
                !rest[..te].contains("src")
            });
            if has_inline {
                assert!(
                    csp.contains("'sha256-"),
                    "inline script present but no hash in csp: {csp}"
                );
            }
        }
    }
}
