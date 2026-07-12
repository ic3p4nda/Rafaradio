use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrackInfo {
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlaylistInfo {
    pub title: String,
    pub tracks: Vec<TrackInfo>,
}

pub struct YTMusicClient {
    client: reqwest::Client,
}

impl YTMusicClient {
    pub fn new() -> Self {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            "User-Agent",
            reqwest::header::HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        );
        headers.insert(
            "Content-Type",
            reqwest::header::HeaderValue::from_static("application/json")
        );
        headers.insert(
            "Origin",
            reqwest::header::HeaderValue::from_static("https://music.youtube.com")
        );
        headers.insert(
            "Referer",
            reqwest::header::HeaderValue::from_static("https://music.youtube.com/")
        );

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self { client }
    }

    /// Helper to construct standard YouTube Remix (YTM) API client contexts
    fn get_context_body(&self, extra_payload: serde_json::Map<String, Value>) -> Value {
        let mut body = json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": "1.20240101.01.00",
                    "hl": "en",
                    "gl": "US",
                    "utcOffsetMinutes": 0
                },
                "user": {
                    "lockedSafetyMode": false
                }
            }
        });

        if let Some(obj) = body.as_object_mut() {
            for (k, v) in extra_payload {
                obj.insert(k, v);
            }
        }
        body
    }

    /// Search tracks using YouTube Music internal search endpoint
    pub async fn search_tracks(&self, query: &str) -> Result<Vec<TrackInfo>, String> {
        let url = "https://music.youtube.com/youtubei/v1/search?alt=json";
        
        let mut extra = serde_json::Map::new();
        extra.insert("query".to_string(), Value::String(query.to_string()));
        // Filter search to songs/videos only
        extra.insert("params".to_string(), Value::String("EgWKAQIIAWoKEAoSCEgBGAFAAQ%3D%3D".to_string()));

        let body = self.get_context_body(extra);

        let response = self.client.post(url)
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let data: Value = response.json().await.map_err(|e| e.to_string())?;
        let mut results = Vec::new();

        // Navigate deep into YouTube Music's nested responsive results structure
        if let Some(contents) = data.pointer("/contents/tabbedSearchResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicShelfRenderer/contents") {
            if let Some(items) = contents.as_array() {
                for item in items {
                    if let Some(track) = self.parse_search_item(item) {
                        results.push(track);
                    }
                }
            }
        }

        Ok(results)
    }

    /// Import/fetch details of a YouTube or YouTube Music playlist
    pub async fn fetch_playlist(&self, playlist_id: &str) -> Result<PlaylistInfo, String> {
        let url = "https://music.youtube.com/youtubei/v1/browse?alt=json";

        let mut extra = serde_json::Map::new();
        extra.insert("browseId".to_string(), Value::String(format!("VL{}", playlist_id)));

        let body = self.get_context_body(extra);

        let response = self.client.post(url)
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let data: Value = response.json().await.map_err(|e| e.to_string())?;

        let title = data.pointer("/header/musicDetailHeaderRenderer/title/runs/0/text")
            .and_then(|v| v.as_str())
            .unwrap_or("Imported Playlist")
            .to_string();

        let mut tracks = Vec::new();

        // Extract playlist items
        if let Some(contents) = data.pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicPlaylistShelfRenderer/contents") {
            if let Some(items) = contents.as_array() {
                for item in items {
                    if let Some(track) = self.parse_playlist_item(item) {
                        tracks.push(track);
                    }
                }
            }
        }

        Ok(PlaylistInfo { title, tracks })
    }

    /// Internal parser for Search Results items
    fn parse_search_item(&self, item: &Value) -> Option<TrackInfo> {
        let renderer = item.get("musicResponsiveListItemRenderer")?;
        
        // Find Video ID
        let video_id = renderer.pointer("/playlistItemData/videoId")
            .and_then(|v| v.as_str())?
            .to_string();

        // Extract Title
        let title = renderer.pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
            .and_then(|v| v.as_str())?
            .to_string();

        // Extract Artist (Usually inside the second column runs)
        let artist = renderer.pointer("/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Artist")
            .to_string();

        // Find Thumbnail (Highest resolution thumbnail)
        let thumbnail = renderer.pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
            .and_then(|v| v.as_array())
            .and_then(|list| list.last())
            .and_then(|thumb| thumb.get("url"))
            .and_then(|url| url.as_str())
            .map(|s| s.to_string());

        Some(TrackInfo {
            video_id,
            title,
            artist,
            thumbnail,
        })
    }

    /// Internal parser for Playlist details list items
    fn parse_playlist_item(&self, item: &Value) -> Option<TrackInfo> {
        let renderer = item.get("musicResponsiveListItemRenderer")?;

        let video_id = renderer.pointer("/playlistItemData/videoId")
            .and_then(|v| v.as_str())?
            .to_string();

        let title = renderer.pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
            .and_then(|v| v.as_str())?
            .to_string();

        let artist = renderer.pointer("/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Artist")
            .to_string();

        let thumbnail = renderer.pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
            .and_then(|v| v.as_array())
            .and_then(|list| list.last())
            .and_then(|thumb| thumb.get("url"))
            .and_then(|url| url.as_str())
            .map(|s| s.to_string());

        Some(TrackInfo {
            video_id,
            title,
            artist,
            thumbnail,
        })
    }
}
