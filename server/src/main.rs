//! keys.justworks server entrypoint.

use keys_justworks_server::{app, connect, AppState, LimiterParams, RateLimiter, SystemClock};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();

    let database_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:keys.db".to_string());
    let db = connect(&database_url).await?;
    let limiter = std::sync::Arc::new(RateLimiter::new(
        LimiterParams::default(),
        std::sync::Arc::new(SystemClock),
    ));
    let listen = std::env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:3000".to_string());
    let listener = tokio::net::TcpListener::bind(&listen).await?;
    tracing::info!("keys.justworks server listening on http://{listen} (db: {database_url})");
    axum::serve(listener, app(AppState { db, limiter })).await?;
    Ok(())
}
