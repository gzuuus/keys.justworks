//! keys.justworks server library.
//!
//! Stateless `ncryptsec` locker (see docs/design.md): stores/serves encrypted
//! key blobs behind `{ identifier_hash, password }` auth. Never decrypts, never
//! signs. Auth is stateless — every handler re-verifies `argon2(password)`
//! inline against the stored verifier; there are no sessions or tokens.

use std::str::FromStr;
use std::sync::OnceLock;

use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post, put};
use axum::{extract::State, Json, Router};
use rand_core::OsRng;
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
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
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}

// --- request / response bodies ----------------------------------------------

#[derive(Deserialize)]
struct RegisterBody {
    identifier_hash: String,
    password: String,
    ncryptsec: String,
}

#[derive(Deserialize)]
struct AuthBody {
    identifier_hash: String,
    password: String,
}

#[derive(Deserialize)]
struct UpdateBlobBody {
    identifier_hash: String,
    password: String,
    new_ncryptsec: String,
    /// Present only on a password change. The client must re-encrypt
    /// `new_ncryptsec` under the new passphrase (`identifier ‖ new_password`)
    /// before sending — the server cannot re-encrypt.
    #[serde(default)]
    new_password: Option<String>,
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

/// Store a new `{ identifier_hash, argon2(password), ncryptsec }`. The password
/// arrives in plaintext over TLS and is hashed server-side — the server owns
/// argon2, never trusting a client-supplied hash.
async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterBody>,
) -> Result<StatusCode, AppError> {
    validate_hash(&body.identifier_hash)?;
    validate_ncryptsec(&body.ncryptsec)?;
    let verifier = hash_password(&body.password)?;

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

/// Verify `{ identifier_hash, password }` and return the stored `ncryptsec`.
/// A missing account and a wrong password are indistinguishable (both 401):
/// the response reveals nothing, and a dummy argon2 verify on the missing path
/// keeps the timing roughly equal.
async fn login(
    State(state): State<AppState>,
    Json(body): Json<AuthBody>,
) -> Result<Json<NcryptsecResp>, AppError> {
    validate_hash(&body.identifier_hash)?;

    let row =
        sqlx::query("SELECT password_verifier, ncryptsec FROM accounts WHERE identifier_hash = ?")
            .bind(&body.identifier_hash)
            .fetch_optional(&state.db)
            .await?;

    let Some(row) = row else {
        // ponytail: timing equalization, not a constant-time guarantee. The
        // real online brute-force defense (per-account/per-IP rate-limiting)
        // is deferred — argon2's slow verify is the floor throttle until then.
        let _ = verify_password(&body.password, dummy_verifier());
        return Err(AppError::Unauthorized);
    };

    let verifier: String = row.try_get("password_verifier")?;
    let ncryptsec: String = row.try_get("ncryptsec")?;

    if !verify_password(&body.password, &verifier)? {
        return Err(AppError::Unauthorized);
    }
    Ok(Json(NcryptsecResp { ncryptsec }))
}

/// Re-encrypt path: verify auth, then replace the blob. With `new_password`,
/// also rotate the verifier (password change). Covers both re-encrypt and
/// password rotation in one atomic request.
async fn update_blob(
    State(state): State<AppState>,
    Json(body): Json<UpdateBlobBody>,
) -> Result<StatusCode, AppError> {
    validate_hash(&body.identifier_hash)?;
    validate_ncryptsec(&body.new_ncryptsec)?;

    authenticated_verifier(&state.db, &body.identifier_hash, &body.password).await?;

    match body.new_password {
        Some(new_password) => {
            let new_verifier = hash_password(&new_password)?;
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
    authenticated_verifier(&state.db, &body.identifier_hash, &body.password).await?;

    sqlx::query("DELETE FROM accounts WHERE identifier_hash = ?")
        .bind(&body.identifier_hash)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

// --- shared auth helper ------------------------------------------------------

/// Fetch the stored verifier for `identifier_hash` and confirm `password`. Used
/// by every non-register mutating route. Returns `Unauthorized` (with a dummy
/// verify on the missing path) for both missing-account and wrong-password.
async fn authenticated_verifier(
    db: &SqlitePool,
    identifier_hash: &str,
    password: &str,
) -> Result<(), AppError> {
    let row = sqlx::query("SELECT password_verifier FROM accounts WHERE identifier_hash = ?")
        .bind(identifier_hash)
        .fetch_optional(db)
        .await?;
    let Some(row) = row else {
        let _ = verify_password(password, dummy_verifier());
        return Err(AppError::Unauthorized);
    };
    let verifier: String = row.try_get("password_verifier")?;
    if !verify_password(password, &verifier)? {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

// --- crypto + validation helpers ---------------------------------------------

/// Argon2id with crate defaults (m=19456 KiB, t=2, p=1 — RFC 9106 first row).
/// ponytail: defaults are fine for now; tune memory/time before production load.
fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    Ok(Argon2::default()
        .hash_password(password.as_bytes(), &salt)?
        .to_string())
}

fn verify_password(password: &str, verifier: &str) -> Result<bool, AppError> {
    let parsed = PasswordHash::new(verifier)?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
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

/// `identifier_hash` is `H(identifier)`: 64 lowercase hex chars (SHA-256). This
/// only validates the wire format the client produces in `@kj/core`, never the
/// identifier's strength (design: disclose, never enforce).
fn validate_hash(h: &str) -> Result<(), AppError> {
    let ok = h.len() == 64 && h.as_bytes().iter().all(|b| b.is_ascii_hexdigit());
    if ok {
        Ok(())
    } else {
        Err(AppError::BadRequest("identifier_hash must be 64 hex chars"))
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
    let file = WebAssets::get(path).or_else(|| WebAssets::get("index.html"));
    match file {
        Some(f) => {
            let mime = mime_guess::from_path(path)
                .first_or_octet_stream()
                .essence_str()
                .to_owned();
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, mime)],
                f.data.into_owned(),
            )
                .into_response()
        }
        None => (StatusCode::NOT_FOUND, "not found").into_response(),
    }
}
