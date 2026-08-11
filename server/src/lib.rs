//! keys.justworks server library.
//!
//! Stateless `ncryptsec` locker (see docs/design.md): stores/serves encrypted
//! key blobs behind `{ identifier_hash, password }` auth. Never decrypts, never
//! signs. Currently exposes the health probe and the embedded static site; the
//! account routes and sqlite storage land next.

use axum::{
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use rust_embed::RustEmbed;
use tower_http::trace::TraceLayer;

/// The static site produced by `packages/web` (`make build-web`), embedded at
/// compile time for a single deployable binary. A checked-in placeholder
/// `index.html` exists so this compiles before the web is ever built.
#[derive(RustEmbed)]
#[folder = "../packages/web/build/"]
struct WebAssets;

/// Build the application router. The API lives under `/api/*`; the bundled
/// static site is served at everything else.
pub fn app() -> Router {
    Router::new()
        .route("/api/health", get(health))
        .fallback(static_handler)
        .layer(TraceLayer::new_for_http())
}

/// Liveness probe. Real auth/account routes also live under `/api/*`.
async fn health() -> &'static str {
    "ok"
}

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
