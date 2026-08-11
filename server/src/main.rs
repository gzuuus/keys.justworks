//! keys.justworks server entrypoint.

use keys_justworks_server::app;

#[tokio::main]
async fn main() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await
        .expect("bind 0.0.0.0:3000");
    let addr = listener.local_addr().expect("local_addr");
    tracing::info!("keys.justworks server listening on http://{addr}");
    axum::serve(listener, app()).await.expect("server run");
}
