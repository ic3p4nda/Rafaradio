#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod proxy;
mod ytmusic;

use proxy::StreamingProxy;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use ytmusic::{TrackInfo, PlaylistInfo, YTMusicClient};

// Global App state container
struct AppState {
    yt_client: YTMusicClient,
    proxy: Arc<StreamingProxy>,
}

#[tauri::command]
async fn search_tracks(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<TrackInfo>, String> {
    state.yt_client.search_tracks(&query).await
}

#[tauri::command]
async fn fetch_playlist(
    playlist_id: String,
    state: State<'_, AppState>,
) -> Result<PlaylistInfo, String> {
    state.yt_client.fetch_playlist(&playlist_id).await
}

#[tauri::command]
async fn get_track_stream(
    video_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Attempt Cobalt/Piped resolution or fallback to proxy tokenized resolution
    // Here we query an upstream stream provider to get the actual stream URL.
    // In our actual implementation, we fallback to cobalt or piped. Let's showcase the Rust resolution:
    let cobalt_url = format!("https://api.cobalt.tools/api/json");
    let client = reqwest::Client::new();
    
    let mut payload = HashMap::new();
    payload.insert("url", format!("https://www.youtube.com/watch?v={}", video_id));
    payload.insert("downloadMode", "audio".to_string());
    payload.insert("audioFormat", "mp3".to_string());

    let response = client.post(&cobalt_url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await;

    if let Ok(res) = response {
        if let Ok(json) = res.json::<serde_json::Value>().await {
            if let Some(stream_url) = json.get("url").and_then(|u| u.as_str()) {
                // Register token to pass the stream safely through our proxy bypassing CORS
                let headers = HashMap::new();
                let token = state.proxy.register_token(stream_url.to_string(), headers);
                return Ok(format!("http://127.0.0.1:8722/stream/{}", token));
            }
        }
    }

    // Piped API Fallback
    let piped_url = format!("https://pipedapi.kavin.rocks/streams/{}", video_id);
    if let Ok(res) = client.get(&piped_url).send().await {
        if let Ok(json) = res.json::<serde_json::Value>().await {
            if let Some(audio_streams) = json.get("audioStreams").and_then(|a| a.as_array()) {
                if let Some(first_stream) = audio_streams.first() {
                    if let Some(stream_url) = first_stream.get("url").and_then(|u| u.as_str()) {
                        let headers = HashMap::new();
                        let token = state.proxy.register_token(stream_url.to_string(), headers);
                        return Ok(format!("http://127.0.0.1:8722/stream/{}", token));
                    }
                }
            }
        }
    }

    Err("Could not resolve stable streaming URL. Check network.".to_string())
}

#[tauri::command]
async fn run_oauth_loopback(
    port: u16,
) -> Result<String, String> {
    // Spawns a temporary listener to intercept Google OAuth token redirect
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port))
        .await
        .map_err(|e| e.to_string())?;

    println!("[Tauri OAuth] Loopback interceptor listening on port {}", port);

    // Wait for the redirect request
    if let Ok((mut socket, _)) = listener.accept().await {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let mut buffer = [0; 1024];
        let _ = socket.read(&mut buffer).await;

        let request_str = String::from_utf8_lossy(&buffer);
        
        // Parse access_token or authorization code from request query params or fragments
        let mut auth_token = String::new();
        if let Some(pos) = request_str.find("code=") {
            let sub = &request_str[pos + 5..];
            if let Some(end) = sub.find(' ') {
                auth_token = sub[..end].to_string();
            }
        }

        // Return standard HTTP success page back to browser
        let response_body = "<html><body style='font-family:sans-serif; background:#030307; color:white; text-align:center; padding-top:50px;'><h2>RafaRadio Authenticated Successfully!</h2><p>You can close this window now.</p></body></html>";
        let http_response = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n{}",
            response_body.len(),
            response_body
        );
        let _ = socket.write_all(http_response.as_bytes()).await;

        return Ok(auth_token);
    }

    Err("OAuth loopback failed to capture credential.".to_string())
}

fn main() {
    let proxy = Arc::new(StreamingProxy::new(8722));
    let proxy_clone = proxy.clone();

    // Spawn proxy server on a separate Tokio thread
    tokio::spawn(async move {
        if let Err(e) = proxy_clone.start().await {
            eprintln!("[Tauri Proxy Error] {}", e);
        }
    });

    tauri::Builder::default()
        .manage(AppState {
            yt_client: YTMusicClient::new(),
            proxy,
        })
        .invoke_handler(tauri::generate_handler![
            search_tracks,
            fetch_playlist,
            get_track_stream,
            run_oauth_loopback
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
