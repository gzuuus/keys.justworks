//! Integration tests for the stateless ncryptsec locker.
//!
//! Each test builds its own in-memory SQLite DB so they run in parallel. The
//! argon2 ops make these ~tens of ms each — fine.

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
        json!({ "identifier_hash": id, "password": "p@ssw0rd!", "ncryptsec": "ncryptsec1aaa" }),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED);

    let (st, body) = send(
        app(s.clone()),
        "POST",
        "/api/login",
        json!({ "identifier_hash": id, "password": "p@ssw0rd!" }),
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
        json!({ "identifier_hash": id, "password": "right", "ncryptsec": "ncryptsec1x" }),
    )
    .await;
    let (st, _) = send(
        app(s.clone()),
        "POST",
        "/api/login",
        json!({ "identifier_hash": id, "password": "wrong" }),
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
        json!({ "identifier_hash": hash(99), "password": "anything" }),
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
        json!({ "identifier_hash": id, "password": "a", "ncryptsec": "ncryptsec1a" }),
    )
    .await;
    let (st, _) = send(
        app(s.clone()),
        "POST",
        "/api/register",
        json!({ "identifier_hash": id, "password": "b", "ncryptsec": "ncryptsec1b" }),
    )
    .await;
    assert_eq!(st, StatusCode::CONFLICT);
}

#[tokio::test]
async fn register_rejects_bad_inputs() {
    let s = setup().await;
    let (st, _) = send(
        app(s.clone()),
        "POST",
        "/api/register",
        json!({ "identifier_hash": "tooshort", "password": "a", "ncryptsec": "ncryptsec1x" }),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    let (st, _) = send(
        app(s.clone()),
        "POST",
        "/api/register",
        json!({ "identifier_hash": hash(4), "password": "a", "ncryptsec": "not-a-ncryptsec" }),
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
        json!({ "identifier_hash": id, "password": "pw", "ncryptsec": "ncryptsec1old" }),
    )
    .await;
    let (st, _) = send(
        app(s.clone()),
        "PUT",
        "/api/blob",
        json!({ "identifier_hash": id, "password": "pw", "new_ncryptsec": "ncryptsec1new" }),
    )
    .await;
    assert_eq!(st, StatusCode::NO_CONTENT);

    let (_, body) = send(
        app(s.clone()),
        "POST",
        "/api/login",
        json!({ "identifier_hash": id, "password": "pw" }),
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
        json!({ "identifier_hash": id, "password": "oldpw", "ncryptsec": "ncryptsec1old" }),
    )
    .await;
    let (st, _) = send(
        app(s.clone()),
        "PUT",
        "/api/blob",
        json!({ "identifier_hash": id, "password": "oldpw", "new_ncryptsec": "ncryptsec1new", "new_password": "newpw" }),
    )
    .await;
    assert_eq!(st, StatusCode::NO_CONTENT);

    let (st, body) = send(
        app(s.clone()),
        "POST",
        "/api/login",
        json!({ "identifier_hash": id, "password": "newpw" }),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(body["ncryptsec"], "ncryptsec1new");

    let (st, _) = send(
        app(s.clone()),
        "POST",
        "/api/login",
        json!({ "identifier_hash": id, "password": "oldpw" }),
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
        json!({ "identifier_hash": id, "password": "pw", "ncryptsec": "ncryptsec1x" }),
    )
    .await;
    let (st, _) = send(
        app(s.clone()),
        "PUT",
        "/api/blob",
        json!({ "identifier_hash": id, "password": "wrong", "new_ncryptsec": "ncryptsec1y" }),
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
        json!({ "identifier_hash": id, "password": "pw", "ncryptsec": "ncryptsec1x" }),
    )
    .await;
    let (st, _) = send(
        app(s.clone()),
        "DELETE",
        "/api/account",
        json!({ "identifier_hash": id, "password": "pw" }),
    )
    .await;
    assert_eq!(st, StatusCode::NO_CONTENT);

    let (st, _) = send(
        app(s.clone()),
        "POST",
        "/api/login",
        json!({ "identifier_hash": id, "password": "pw" }),
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
        json!({ "identifier_hash": id, "password": "pw", "ncryptsec": "ncryptsec1x" }),
    )
    .await;
    let (st, _) = send(
        app(s.clone()),
        "DELETE",
        "/api/account",
        json!({ "identifier_hash": id, "password": "wrong" }),
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}
