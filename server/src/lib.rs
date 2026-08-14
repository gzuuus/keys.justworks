//! keys.justworks server library.
//!
//! Stateless `ncryptsec` locker (see docs/design.md): stores/serves encrypted
//! key blobs behind `{ identifier_hash, password_secret }` auth. Never
//! decrypts, never signs. Auth is stateless — every handler re-verifies
//! `argon2(password_secret)` inline against the stored verifier; there are no
//! sessions or tokens. The client sends `scrypt(password)` as `password_secret`
//! (the raw password never reaches the server — see @kj/core); the server
//! applies argon2 on top, so the stored verifier is never the wire value.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

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
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Row, SqlitePool};
use thiserror::Error;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

/// The static site produced by `packages/web` (`make build-web`), embedded at
/// compile time for a single deployable binary. A checked-in placeholder
/// `index.html` exists so this compiles before the web is ever built.
#[derive(RustEmbed)]
#[folder = "../packages/web/build/"]
struct WebAssets;

/// Server state: a SQLite connection pool + the in-memory rate limiter. Both
/// are `Arc`d internally, so `AppState` clones cheaply (it's cloned per request).
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub limiter: Arc<RateLimiter>,
}

/// Connect to SQLite at `database_url` (e.g. `sqlite:keys.db`), enable WAL, and
/// run the schema bootstrap. Used by the binary; tests build their own pool.
pub async fn connect(database_url: &str) -> Result<SqlitePool, sqlx::Error> {
    let options = SqliteConnectOptions::from_str(database_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        // Wait (up to 5s) on write contention instead of erroring into a 500 —
        // SQLite serializes writers; in WAL mode reads don't block.
        .busy_timeout(Duration::from_secs(5))
        // Durability is sacred here ("no recovery by design"): never trade the
        // last committed txn away for speed. Writes are argon2-bound anyway.
        .synchronous(SqliteSynchronous::Full);
    // Small pool: SQLite is single-writer, extra connections only invite
    // contention; `busy_timeout` handles the rare overlap. ponytail: bump if a
    // read-heavy profile measurably benefits, or move to Postgres at scale.
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await?;
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
        // Self-hosted extension artifacts (auto-update + direct download).
        // 404 unless KJ_EXTENSION_DIR is set — see docs/extension-release.md.
        .route("/extension/update.xml", get(extension_update_xml))
        .route("/extension/keys-justworks.crx", get(extension_crx))
        .fallback(static_handler)
        .layer(TraceLayer::new_for_http())
        .layer(from_fn(security_headers))
        // Open CORS (`*`): any origin may integrate — auth is body-only, so no
        // CSRF vector and no credentials needed (and `*` forbids them anyway).
        // Added last → outermost, so preflight OPTIONS short-circuits here.
        // See docs/architecture.md.
        .layer(CorsLayer::permissive().max_age(Duration::from_secs(86400)))
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
    #[error("rate limited")]
    RateLimited(Duration),
    #[error("database error")]
    Database(#[from] sqlx::Error),
    #[error("password hash error: {0}")]
    Argon2(String),
    #[error("internal error")]
    Internal,
}

impl From<argon2::password_hash::Error> for AppError {
    fn from(e: argon2::password_hash::Error) -> Self {
        // `password_hash::Error` doesn't impl `std::error::Error`, so it can't
        // be a thiserror `#[from]` source; stringify to keep the detail for logs.
        AppError::Argon2(e.to_string())
    }
}

/// Rate-limit miss (`retry_after`) → 429. Lets handlers do `limiter.check(..)?`.
impl From<Duration> for AppError {
    fn from(retry_after: Duration) -> Self {
        AppError::RateLimited(retry_after)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match self {
            AppError::BadRequest(msg) => return (StatusCode::BAD_REQUEST, msg).into_response(),
            AppError::RateLimited(retry) => {
                let mut res = (StatusCode::TOO_MANY_REQUESTS, "rate limited").into_response();
                // `Retry-After` in whole seconds (>=1 so clients back off).
                let secs = retry.as_secs().max(1).to_string();
                if let Ok(v) = HeaderValue::from_str(&secs) {
                    res.headers_mut().insert(header::RETRY_AFTER, v);
                }
                return res;
            }
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::Conflict => StatusCode::CONFLICT,
            // Don't leak internal detail (DB / argon2 internals) to clients.
            AppError::Database(_) | AppError::Argon2(_) | AppError::Internal => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
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
    // Global register bucket: bounds anonymous account creation / DB pollution
    // (per-account is meaningless for register — it creates the account).
    state.limiter.check_register()?;
    let verifier = hash_secret_blocking(body.password_secret).await?;

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
    // Per-account (targeted brute-force) + global auth (argons/sec DoS ceiling).
    // Checked before the argon2 work so the throttle protects CPU, not just the
    // DB. Missing-account spray is bounded by the global bucket.
    state.limiter.check_authed(&body.identifier_hash)?;

    let row =
        sqlx::query("SELECT password_verifier, ncryptsec FROM accounts WHERE identifier_hash = ?")
            .bind(&body.identifier_hash)
            .fetch_optional(&state.db)
            .await?;

    let Some(row) = row else {
        // Timing equalization (not constant-time): do the argon2 work on the
        // missing path too, off the async thread.
        let _ = verify_secret_blocking(body.password_secret.clone(), dummy_verifier().to_string())
            .await?;
        return Err(AppError::Unauthorized);
    };

    let verifier: String = row.try_get("password_verifier")?;
    let ncryptsec: String = row.try_get("ncryptsec")?;

    if !verify_secret_blocking(body.password_secret.clone(), verifier).await? {
        return Err(AppError::Unauthorized);
    }
    // Success: refund the per-account token so a legit user logging in never
    // throttles their own account. (Global is NOT refunded — it bounds total
    // throughput, not per-user fairness.)
    state.limiter.refund_authed(&body.identifier_hash);
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
    state.limiter.check_authed(&body.identifier_hash)?;

    authenticated_verifier(&state.db, &body.identifier_hash, &body.password_secret).await?;

    match body.new_password_secret {
        Some(new_password_secret) => {
            validate_secret(&new_password_secret)?;
            let new_verifier = hash_secret_blocking(new_password_secret).await?;
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
    state.limiter.refund_authed(&body.identifier_hash);
    Ok(StatusCode::NO_CONTENT)
}

/// Verify auth, then delete the account.
async fn delete_account(
    State(state): State<AppState>,
    Json(body): Json<AuthBody>,
) -> Result<StatusCode, AppError> {
    validate_hash(&body.identifier_hash)?;
    validate_secret(&body.password_secret)?;
    state.limiter.check_authed(&body.identifier_hash)?;
    authenticated_verifier(&state.db, &body.identifier_hash, &body.password_secret).await?;

    sqlx::query("DELETE FROM accounts WHERE identifier_hash = ?")
        .bind(&body.identifier_hash)
        .execute(&state.db)
        .await?;
    state.limiter.refund_authed(&body.identifier_hash);
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
        let _ = verify_secret_blocking(password_secret.to_string(), dummy_verifier().to_string())
            .await?;
        return Err(AppError::Unauthorized);
    };
    let verifier: String = row.try_get("password_verifier")?;
    if !verify_secret_blocking(password_secret.to_string(), verifier).await? {
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

// --- argon2 off the async thread --------------------------------------------

/// `hash_secret` run on the blocking pool, so argon2 (~tens of ms) never stalls
/// a tokio worker thread. Takes owned strings — `spawn_blocking` needs `'static`.
async fn hash_secret_blocking(secret: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || hash_secret(&secret))
        .await
        .map_err(|_| AppError::Internal)?
}

async fn verify_secret_blocking(secret: String, verifier: String) -> Result<bool, AppError> {
    tokio::task::spawn_blocking(move || verify_secret(&secret, &verifier))
        .await
        .map_err(|_| AppError::Internal)?
}

// --- rate limiting (in-memory token bucket) ---------------------------------
//
// Per-`identifier_hash` (targeted brute-force) + two keyless global buckets
// (auth argon2 throughput, registrations). No per-IP: that's the NAT/VPN
// footgun, and the operator's reverse proxy is the right place for it. All
// state is process-local. ponytail: per-instance, not shared — fine for one
// VPS; add a shared store only when scaling horizontally.

/// Injectable monotonic clock so the bucket time logic is testable without
/// `tokio::time::sleep`. The one earned abstraction here: time is otherwise
/// untestable.
pub trait Clock: Send + Sync {
    fn now(&self) -> Instant;
}

/// Real wallclock-monotonic clock.
pub struct SystemClock;
impl Clock for SystemClock {
    fn now(&self) -> Instant {
        Instant::now()
    }
}

/// Token-bucket parameters. Defaults suit a single-VPS deployment. ponytail:
/// not env-configured yet — add when an operator actually needs to tune live.
pub struct LimiterParams {
    /// Per-`identifier_hash`: bounds targeted brute-force on one account.
    pub account_capacity: f64,
    pub account_refill_per_sec: f64,
    /// Global: bounds total login/blob/account argon2 throughput (DoS ceiling).
    pub auth_global_capacity: f64,
    pub auth_global_refill_per_sec: f64,
    /// Global: bounds anonymous registration / DB pollution.
    pub register_global_capacity: f64,
    pub register_global_refill_per_sec: f64,
}

impl Default for LimiterParams {
    fn default() -> Self {
        Self {
            // Per account: burst 5, then ~1 token / 10s (~6/min). Futile against
            // any decent password, especially since each attempt also costs the
            // attacker a client-side scrypt.
            account_capacity: 5.0,
            account_refill_per_sec: 0.1,
            // Total argons/sec ceiling: burst 20, ~5/s sustained. Keeps a small
            // VPS's CPU bounded under a spray of identifier hashes.
            auth_global_capacity: 20.0,
            auth_global_refill_per_sec: 5.0,
            // Registrations: burst 10, ~1/s sustained. Bounds pollution without
            // gating legit signups.
            register_global_capacity: 10.0,
            register_global_refill_per_sec: 1.0,
        }
    }
}

/// One token bucket. Refilled lazily on each `check` (no timer): elapsed time
/// since `last` adds `elapsed * refill_per_sec` tokens, capped at `capacity`.
struct Bucket {
    tokens: f64,
    last: Instant,
}

impl Bucket {
    fn new(capacity: f64, now: Instant) -> Self {
        Self {
            tokens: capacity,
            last: now,
        }
    }

    /// Lazily refill, then try to consume one token. `Ok(())` on success;
    /// `Err(retry_after)` if empty.
    fn check(&mut self, capacity: f64, refill_per_sec: f64, now: Instant) -> Result<(), Duration> {
        let elapsed = now.saturating_duration_since(self.last).as_secs_f64();
        self.tokens = (self.tokens + elapsed * refill_per_sec).min(capacity);
        self.last = now;
        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            Ok(())
        } else {
            let needed = 1.0 - self.tokens;
            // Guard the 0-refill case (would divide by zero); clamp to 1h.
            let secs = if refill_per_sec > 0.0 {
                (needed / refill_per_sec).min(3600.0)
            } else {
                3600.0
            };
            Err(Duration::from_secs_f64(secs))
        }
    }

    /// Refund one token (capped at capacity) — used on successful auth.
    fn refund(&mut self, capacity: f64) {
        self.tokens = (self.tokens + 1.0).min(capacity);
    }
}

pub struct RateLimiter {
    params: LimiterParams,
    clock: Arc<dyn Clock>,
    inner: Mutex<Inner>,
}

/// Per-account buckets idle longer than this are dropped (bounds memory under
/// identifier-hash spray). ponytail: fixed const; expose as a param if tuning
/// ever matters.
const EVICT_IDLE_AFTER: Duration = Duration::from_secs(600);

struct Inner {
    accounts: HashMap<String, Bucket>,
    auth_global: Bucket,
    register_global: Bucket,
    last_eviction: Instant,
}

impl RateLimiter {
    pub fn new(params: LimiterParams, clock: Arc<dyn Clock>) -> Self {
        let now = clock.now();
        Self {
            inner: Mutex::new(Inner {
                accounts: HashMap::new(),
                auth_global: Bucket::new(params.auth_global_capacity, now),
                register_global: Bucket::new(params.register_global_capacity, now),
                last_eviction: now,
            }),
            params,
            clock,
        }
    }

    /// Check per-account + global auth buckets. Call before argon2 on login,
    /// `PUT /api/blob`, `DELETE /api/account`. Returns `Err(retry_after)` → 429.
    pub fn check_authed(&self, identifier_hash: &str) -> Result<(), Duration> {
        let now = self.clock.now();
        let cap = self.params.account_capacity;
        let refill = self.params.account_refill_per_sec;
        let gcap = self.params.auth_global_capacity;
        let grefill = self.params.auth_global_refill_per_sec;
        let mut inner = self.inner.lock().unwrap();
        maybe_evict(&mut inner, now);
        // Global first: a miss here means no argon2 work runs at all.
        inner.auth_global.check(gcap, grefill, now)?;
        let bucket = inner
            .accounts
            .entry(identifier_hash.to_string())
            .or_insert_with(|| Bucket::new(cap, now));
        bucket.check(cap, refill, now)
    }

    /// Refund the per-account token on successful auth (NOT the global bucket).
    pub fn refund_authed(&self, identifier_hash: &str) {
        let cap = self.params.account_capacity;
        let mut inner = self.inner.lock().unwrap();
        if let Some(b) = inner.accounts.get_mut(identifier_hash) {
            b.refund(cap);
        }
    }

    /// Check the global register bucket (per-account is meaningless for register).
    pub fn check_register(&self) -> Result<(), Duration> {
        let now = self.clock.now();
        let cap = self.params.register_global_capacity;
        let refill = self.params.register_global_refill_per_sec;
        let mut inner = self.inner.lock().unwrap();
        maybe_evict(&mut inner, now);
        inner.register_global.check(cap, refill, now)
    }
}

/// Sweep per-account buckets idle longer than `EVICT_IDLE_AFTER`, at most every
/// 60s. O(n) but bounded by active-account volume.
fn maybe_evict(inner: &mut Inner, now: Instant) {
    if now.saturating_duration_since(inner.last_eviction) < Duration::from_secs(60) {
        return;
    }
    inner.last_eviction = now;
    inner
        .accounts
        .retain(|_, b| now.saturating_duration_since(b.last) < EVICT_IDLE_AFTER);
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

// --- extension artifacts (self-hosted .crx + auto-update manifest) -----------

/// Directory served under `/extension/*` (env `KJ_EXTENSION_DIR`): holds the
/// release artifacts (`update.xml`, `keys-justworks.crx`) synced by
/// `scripts/sync-extension.sh`. Unset → the routes 404 and the site's download
/// page degrades gracefully. Read once — config is process-wide (cf.
/// `csp_header`, which uses the same OnceLock pattern).
fn extension_dir() -> Option<&'static Path> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| std::env::var("KJ_EXTENSION_DIR").ok().map(PathBuf::from))
        .as_deref()
}

/// Serve one file from `dir`. Two fixed routes instead of a directory walk:
/// the artifact set is exactly these two files, and a closed set makes path
/// traversal a non-question.
async fn extension_file(dir: Option<&Path>, file: &str) -> Response {
    let Some(dir) = dir else {
        return (StatusCode::NOT_FOUND, "extension artifacts not configured").into_response();
    };
    match tokio::fs::read(dir.join(file)).await {
        Ok(bytes) => {
            let mime = mime_guess::from_path(file)
                .first_or_octet_stream()
                .essence_str()
                .to_owned();
            (StatusCode::OK, [(header::CONTENT_TYPE, mime)], bytes).into_response()
        }
        Err(_) => (StatusCode::NOT_FOUND, "extension artifact missing").into_response(),
    }
}

async fn extension_update_xml() -> Response {
    extension_file(extension_dir(), "update.xml").await
}

async fn extension_crx() -> Response {
    extension_file(extension_dir(), "keys-justworks.crx").await
}

// --- perimeter: CSP + security response headers -----------------------------

/// The `Content-Security-Policy` for the bundled site. `script-src` is `'self'`
/// plus a hash of SvelteKit's inline bootstrap loader (the inline `<script>`
/// SvelteKit emits), computed from the embedded `index.html` so it stays in sync
/// across rebuilds. Computed once and cached. See docs/design.md "Perimeter
/// defense". `connect-src` also allows the `wss:` scheme so the NIP-46 bunker
/// can reach user-chosen relays (the primary XSS defense remains
/// `script-src 'self'`; see docs/design.md "Perimeter defense").
/// `img-src` allows `https:` so profile avatars (kind 0 pictures — arbitrary
/// https URLs chosen by the key owner) can render; the residual risk of an
/// image-request beacon under XSS is accepted because `script-src 'self'`
/// (no inline) already blocks script execution, and the client renders
/// avatars with `referrerpolicy=no-referrer`.
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
         img-src 'self' https:; font-src 'self'; connect-src 'self' wss:; object-src 'none'; \
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

    #[tokio::test]
    async fn extension_artifacts_route() {
        let dir = std::env::temp_dir().join(format!("kj-ext-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("update.xml"), "<gupdate/>").unwrap();

        // present file → 200 with an xml content type
        let r = extension_file(Some(&dir), "update.xml").await;
        assert_eq!(r.status(), StatusCode::OK);
        assert!(r.headers()[header::CONTENT_TYPE]
            .to_str()
            .unwrap()
            .contains("xml"));

        // missing file → 404; unset dir → 404 (graceful when not configured)
        assert_eq!(
            extension_file(Some(&dir), "keys-justworks.crx")
                .await
                .status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            extension_file(None, "update.xml").await.status(),
            StatusCode::NOT_FOUND
        );

        std::fs::remove_dir_all(&dir).unwrap();
    }

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
