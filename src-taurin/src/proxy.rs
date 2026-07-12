use axum::{
    body::{Body, StreamBody},
    extract::{Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use futures::StreamExt;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, RwLock};
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Clone)]
pub struct ProxyState {
    pub tokens: Arc<RwLock<HashMap<String, StreamToken>>>,
}

#[derive(Clone)]
pub struct StreamToken {
    pub url: String,
    pub headers: HashMap<String, String>,
}

pub struct StreamingProxy {
    state: ProxyState,
    port: u16,
}

impl StreamingProxy {
    pub fn new(port: u16) -> Self {
        Self {
            state: ProxyState {
                tokens: Arc::new(RwLock::new(HashMap::new())),
            },
            port,
        }
    }

    /// Register a new audio streaming url and return a safe temporary proxy token
    pub fn register_token(&self, url: String, headers: HashMap<String, String>) -> String {
        let token = Uuid::new_v4().to_string();
        let mut tokens = self.state.tokens.write().unwrap();
        tokens.insert(token.clone(), StreamToken { url, headers });
        token
    }

    /// Spin up the local HTTP streaming server natively on a tokio thread
    pub async fn start(self) -> Result<(), String> {
        let app = Router::new()
            .route("/stream/:token", get(handle_stream_request))
            .with_state(self.state);

        let addr = SocketAddr::from(([127, 0, 0, 1], self.port));
        println!("[Tauri Proxy] Starting local streaming server on http://{}", addr);

        axum::Server::bind(&addr)
            .serve(app.into_make_service())
            .await
            .map_err(|e| e.to_string())
    }
}

async fn handle_stream_request(
    Path(token): Path<String>,
    headers: HeaderMap,
    State(state): State<ProxyState>,
) -> impl IntoResponse {
    let entry = {
        let tokens = state.tokens.read().unwrap();
        tokens.get(&token).cloned()
    };

    let stream_token = match entry {
        Some(e) => e,
        None => return (StatusCode::NOT_FOUND, "Token not found or expired").into_response(),
    };

    let client = reqwest::Client::new();
    let mut request_builder = client.get(&stream_token.url);

    // Forward relevant incoming client headers (such as Range headers for audio seeking)
    for (key, val) in &stream_token.headers {
        if let Ok(hk) = reqwest::header::HeaderName::from_bytes(key.as_bytes()) {
            if let Ok(hv) = reqwest::header::HeaderValue::from_str(val) {
                request_builder = request_builder.header(hk, hv);
            }
        }
    }

    if let Some(range) = headers.get(header::RANGE) {
        request_builder = request_builder.header(header::RANGE, range.clone());
    }

    let upstream_res = match request_builder.send().await {
        Ok(res) => res,
        Err(err) => {
            return (
                StatusCode::BAD_GATEWAY,
                format!("Failed to retrieve upstream audio: {}", err),
            )
                .into_response()
        }
    };

    let mut response_headers = HeaderMap::new();
    
    // Copy content-type, content-range, content-length, accept-ranges from upstream
    let copy_headers = [
        header::CONTENT_TYPE,
        header::CONTENT_LENGTH,
        header::CONTENT_RANGE,
        header::ACCEPT_RANGES,
    ];

    for h in &copy_headers {
        if let Some(v) = upstream_res.headers().get(h) {
            response_headers.insert(h.clone(), v.clone());
        }
    }

    // CORS Headers for browser sandbox access
    response_headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    response_headers.insert(header::ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET, OPTIONS"));

    let status = upstream_res.status();

    // Map reqwest body stream to axum Response stream body
    let stream = upstream_res
        .bytes_stream()
        .map(|r| r.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)));

    Response::builder()
        .status(status)
        .body(Body::wrap_stream(stream))
        .unwrap()
        .into_response()
}
