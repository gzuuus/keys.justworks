//! Integration tests for the stateless ncryptsec locker.
//!
//! Each test builds its own in-memory SQLite DB so they run in parallel. The
//! argon2 ops make these ~tens of ms each — fine.
//!
//! `password_secret` is the client-derived `scrypt(password)`: 32 bytes, sent as
//! 64 hex. The server never sees the raw password. Test values are opaque 64-hex
//! stand-ins (`secret(n)`) — the server only checks the wire format.

use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use axum::Router;
use keys_justworks_server::{app, init_schema, AppState};
use serde_json::{json, Value};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::str::FromStr;
use tower::ServiceExt;

/// A valid-looking 64-hex `identifier_hash` (the server only checks the wire
/// format produced by `@kj/core`, never identifier strength).
fn hash(n: u32) -> String {
    format!("{n:0>64x}")
}

/// A valid-looking 64-hex `password_secret` stand-in. Distinct per `n` so
/// "right" and "wrong" secrets differ within a test.
fn secret(n: u32) -> String {
    format!("{n:0>64x}")
}

async fn setup() -> AppState {
    let opts = SqliteConnectOptions::from_str("sqlite::memory:")
        .unwrap()
        .create_if_missing(true)
        .shared_cache(true);
    let db = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .unwrap();
    init_schema(&db).await.unwrap();
    AppState { db }
}

async fn send(router: Router, method: &str, uri: &str, body: Value) -> (StatusCode, Value) {
    let resp = router
        .oneshot(
            Request::builder()
                .method(method)
                .uri(uri)
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = resp.status();
    let bytes = to_bytes(resp.into_body(), usize::MAX).await.unwrap();
    let val = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (status, val)
}

#[tokio::test]
async fn health_ok() {
    let state = setup().await;
    let resp = app(state)
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn register_then_login() {
    let s = setup().await;
    let id = hash(1);
    let (st, _) = send(
        app(s.clone()),
        "POST",
        "/api/register",
        json!({ "identifier_hash": id, "password_secret": secret(1), "ncryptsec": "ncryptsec1aaa" }),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED);

    let (st, body) = send(
        app(s.clone()),
        "POST",
        "/api/login",
        json!({ "identifier_hash": id, "password_secret": secret(1) }),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(body["ncryptsec"], "ncryptsec1aaa");
}

#[tokio::test]
async fn login_wrong_password_is_unauthorized() {
    let s = setup().await;
    let id = hash(2);
    send(
        app(s.clone()),
        "POST",
        "/api/register",
        json!({ "identifier_hash": id, "password_secret": secret(2), "ncryptsec": "ncryptsec1x" }),
    )
    .await;
    let (st, _) = send(
        app(s.clone()),
        "POST",
        "/api/login",
        json!({ "identifier_hash": id, "password_secret": secret(3) }),
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn login_unknown_account_is_unauthorized() {
    let s = setup().await;
    let (st, _) = send(
        app(s.clone()),
        "POST",
        "/api/login",
        json!({ "identifier_hash": hash(99), "password_secret": secret(4) }),
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn register_duplicate_conflicts() {
    let s = setup().await;
    let id = hash(3);
    send(
        app(s.clone()),
        "POST",
        "/api/register",
        json!({ "identifier_hash": id, "password_secret": secret(5), "ncryptsec": "ncryptsec1a" }),
    )
    .await;
    let (st, _) = send(
        app(s.clone()),
        "POST",
        "/api/register",
        json!({ "identifier_hash": id, "password_secret": secret(6), "ncryptsec": "ncryptsec1b" }),
    )
    .await;
    assert_eq!(st, StatusCode::CONFLICT);
}

#[tokio::test]
async fn register_rejects_bad_inputs() {
    let s = setup().await;
    // bad identifier_hash (password_secret + ncryptsec valid → isolates id check)
    let (st, _) = send(
        app(s.clone()),
        "POST",
        "/api/register",
        json!({ "identifier_hash": "tooshort", "password_secret": secret(7), "ncryptsec": "ncryptsec1x" }),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // bad ncryptsec (id + password_secret valid → isolates ncryptsec check)
    let (st, _) = send(
        app(s.clone()),
        "POST",
        "/api/register",
        json!({ "identifier_hash": hash(4), "password_secret": secret(8), "ncryptsec": "not-a-ncryptsec" }),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // bad password_secret (id + ncryptsec valid → isolates the secret check,
    // i.e. rejects a raw password someone sent by mistake)
    let (st, _) = send(
        app(s.clone()),
        "POST",
        "/api/register",
        json!({ "identifier_hash": hash(40), "password_secret": "not-64-hex", "ncryptsec": "ncryptsec1x" }),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn update_blob_rotates_ncryptsec() {
    let s = setup().await;
    let id = hash(5);
    send(
        app(s.clone()),
        "POST",
        "/api/register",
        json!({ "identifier_hash": id, "password_secret": secret(9), "ncryptsec": "ncryptsec1old" }),
    )
    .await;
    let (st, _) = send(
        app(s.clone()),
        "PUT",
        "/api/blob",
        json!({ "identifier_hash": id, "password_secret": secret(9), "new_ncryptsec": "ncryptsec1new" }),
    )
    .await;
    assert_eq!(st, StatusCode::NO_CONTENT);

    let (_, body) = send(
        app(s.clone()),
        "POST",
        "/api/login",
        json!({ "identifier_hash": id, "password_secret": secret(9) }),
    )
    .await;
    assert_eq!(body["ncryptsec"], "ncryptsec1new");
}

#[tokio::test]
async fn update_blob_with_password_change() {
    let s = setup().await;
    let id = hash(6);
    send(
        app(s.clone()),
        "POST",
        "/api/register",
        json!({ "identifier_hash": id, "password_secret": secret(10), "ncryptsec": "ncryptsec1old" }),
    )
    .await;
    let (st, _) = send(
        app(s.clone()),
        "PUT",
        "/api/blob",
        json!({ "identifier_hash": id, "password_secret": secret(10), "new_ncryptsec": "ncryptsec1new", "new_password_secret": secret(11) }),
    )
    .await;
    assert_eq!(st, StatusCode::NO_CONTENT);

    let (st, body) = send(
        app(s.clone()),
        "POST",
        "/api/login",
        json!({ "identifier_hash": id, "password_secret": secret(11) }),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(body["ncryptsec"], "ncryptsec1new");

    let (st, _) = send(
        app(s.clone()),
        "POST",
        "/api/login",
        json!({ "identifier_hash": id, "password_secret": secret(10) }),
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn update_blob_wrong_password_is_unauthorized() {
    let s = setup().await;
    let id = hash(10);
    send(
        app(s.clone()),
        "POST",
        "/api/register",
        json!({ "identifier_hash": id, "password_secret": secret(12), "ncryptsec": "ncryptsec1x" }),
    )
    .await;
    let (st, _) = send(
        app(s.clone()),
        "PUT",
        "/api/blob",
        json!({ "identifier_hash": id, "password_secret": secret(13), "new_ncryptsec": "ncryptsec1y" }),
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn delete_account() {
    let s = setup().await;
    let id = hash(7);
    send(
        app(s.clone()),
        "POST",
        "/api/register",
        json!({ "identifier_hash": id, "password_secret": secret(14), "ncryptsec": "ncryptsec1x" }),
    )
    .await;
    let (st, _) = send(
        app(s.clone()),
        "DELETE",
        "/api/account",
        json!({ "identifier_hash": id, "password_secret": secret(14) }),
    )
    .await;
    assert_eq!(st, StatusCode::NO_CONTENT);

    let (st, _) = send(
        app(s.clone()),
        "POST",
        "/api/login",
        json!({ "identifier_hash": id, "password_secret": secret(14) }),
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn delete_account_wrong_password_is_unauthorized() {
    let s = setup().await;
    let id = hash(8);
    send(
        app(s.clone()),
        "POST",
        "/api/register",
        json!({ "identifier_hash": id, "password_secret": secret(15), "ncryptsec": "ncryptsec1x" }),
    )
    .await;
    let (st, _) = send(
        app(s.clone()),
        "DELETE",
        "/api/account",
        json!({ "identifier_hash": id, "password_secret": secret(16) }),
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn security_headers_present_on_every_response() {
    let s = setup().await;
    let resp = app(s)
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let h = resp.headers();
    assert_eq!(h.get("x-content-type-options").unwrap(), "nosniff");
    assert_eq!(h.get("x-frame-options").unwrap(), "DENY");
    assert_eq!(h.get("referrer-policy").unwrap(), "no-referrer");
    assert_eq!(h.get("cross-origin-opener-policy").unwrap(), "same-origin");
    let csp = h.get("content-security-policy").unwrap().to_str().unwrap();
    assert!(csp.contains("script-src 'self'"), "{csp}");
    assert!(csp.contains("frame-ancestors 'none'"), "{csp}");
    assert!(csp.contains("object-src 'none'"), "{csp}");
}
