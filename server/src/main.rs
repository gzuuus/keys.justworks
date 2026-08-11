//! keys.justworks server.
//!
//! Stateless key locker: stores/serves `ncryptsec` blobs behind identifier +
//! password auth. Never decrypts, never signs (see docs/design.md).
//!
//! Skeleton: serves `/api/health` and the bundled static site at everything
//! else. Register/login/account routes and sqlite storage land next.

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

#[tokio::main]
async fn main() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();

    let app = Router::new()
        .route("/api/health", get(health))
        .fallback(static_handler)
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await
        .expect("bind 0.0.0.0:3000");
    let addr = listener
        .local_addr()
        .expect("local_addr");
    tracing::info!("keys.justworks server listening on http://{addr}");
    axum::serve(listener, app).await.expect("server run");
}

/// Liveness probe. Real auth/account routes will also live under `/api/*`.
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
