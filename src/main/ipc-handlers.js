const { ipcMain, dialog, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const YTMusic = require('ytmusic-api').default || require('ytmusic-api');
const YTDlpWrap = require('yt-dlp-wrap').default;

const { fetchLyrics } = require('../shared/lyrics-service');
const { getYtDlpPaths, ensureYtDlp } = require('../shared/ytdlp-manager');
const { streamTokens, proxyReady, getProxyPort } = require('./proxy-server');
const {
  fetchStreamFromCobalt,
  fetchStreamFromPiped,
  importPlaylistFromPiped,
  getYouTubeApi
} = require('../shared/youtube-utils');

const { binDir, ytDlpPath } = getYtDlpPaths(true, app);
const ytDlpWrap = new YTDlpWrap(ytDlpPath);

let ytMusicInstance = null;
async function getYTMusic() {
  if (!ytMusicInstance) {
    ytMusicInstance = new YTMusic();
    await ytMusicInstance.initialize();
  }
  return ytMusicInstance;
}

const OAUTH_LOOPBACK_PORT = 8721;

function performGoogleOAuth() {
  return new Promise((resolve, reject) => {
    try {
      let configPath;

      if (app.isPackaged) {
        configPath = path.join(process.resourcesPath, 'firebase-applet-config.json');
      } else {
        // Since we are in src/main/ipc-handlers.js, step back two levels to root
        configPath = path.join(__dirname, '..', '..', 'firebase-applet-config.json');
      }

      console.log('Attempting to load configuration from:', configPath);

      if (!fs.existsSync(configPath)) {
        throw new Error(`Configuration file not found at path: ${configPath}`);
      }
      
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const clientId = config.oAuthClientId;

      if (!clientId) {
        throw new Error('OAuth Client ID missing in configuration.');
      }

      const redirectUri = `http://127.0.0.1:${OAUTH_LOOPBACK_PORT}/oauth-callback`;
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'token',
        scope: 'https://www.googleapis.com/auth/youtube.readonly',
        prompt: 'consent'
      }).toString();

      let settled = false;
      let timeoutHandle;

      const server = http.createServer((req, res) => {
        let parsedUrl;
        try {
          parsedUrl = new URL(req.url, `http://127.0.0.1:${OAUTH_LOOPBACK_PORT}`);
        } catch (e) {
          res.writeHead(400);
          res.end();
          return;
        }

        if (parsedUrl.pathname === '/oauth-callback') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html>
<html><body style="font-family: sans-serif; text-align:center; margin-top:80px;">
  <p>Signing you in…</p>
  <script>
    var hash = window.location.hash.substring(1);
    window.location.replace('/token?' + hash);
  </script>
</body></html>`);
          return;
        }

        if (parsedUrl.pathname === '/token') {
          const accessToken = parsedUrl.searchParams.get('access_token');
          const error = parsedUrl.searchParams.get('error');

          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html>
<html><body style="font-family: sans-serif; text-align:center; margin-top:80px;">
  <h2>${accessToken ? 'Signed in!' : 'Sign-in failed'}</h2>
  <p>You can close this tab and go back to the application.</p>
</body></html>`);

          cleanup();
          if (accessToken) {
            resolve(accessToken);
          } else {
            reject(new Error(error || 'No access token was returned.'));
          }
          return;
        }

        res.writeHead(404);
        res.end();
      });

      function cleanup() {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        server.close();
      }

      server.on('error', (err) => {
        cleanup();
        reject(err);
      });

      server.listen(OAUTH_LOOPBACK_PORT, '127.0.0.1', () => {
        shell.openExternal(authUrl);
      });

      timeoutHandle = setTimeout(() => {
        cleanup();
        reject(new Error('Sign-in timed out.'));
      }, 3 * 60 * 1000);

    } catch (err) {
      reject(err);
    }
  });
}

function registerIpcHandlers(getMainWindow) {
  ipcMain.handle('open-audio-files', async () => {
    const mainWindow = getMainWindow();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select audio files',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'm4a', 'ogg'] }],
    });

    if (result.canceled) return [];
    return result.filePaths;
  });

  ipcMain.handle('get-track-metadata', async (event, filePath) => {
    try {
      const mm = await import('music-metadata');
      const metadata = await mm.parseFile(filePath);
      const picture = metadata.common.picture && metadata.common.picture[0];

      let cover = null;
      if (picture) {
        const base64 = Buffer.from(picture.data).toString('base64');
        cover = `data:${picture.format};base64,${base64}`;
      }

      return {
        title: metadata.common.title || null,
        artist: metadata.common.artist || null,
        album: metadata.common.album || null,
        cover,
      };
    } catch (err) {
      return { title: null, artist: null, album: null, cover: null };
    }
  });

  ipcMain.handle('youtube-search', async (event, query) => {
    try {
      const yt = await getYTMusic();
      const songs = await yt.searchSongs(query);
      return songs.slice(0, 20).map((s) => ({
        videoId: s.videoId,
        title: s.name,
        artist: s.artist ? s.artist.name : 'Unknown artist',
        thumbnail: s.thumbnails && s.thumbnails.length ? s.thumbnails[s.thumbnails.length - 1].url : null,
      }));
    } catch (err) {
      console.error('YouTube search failed:', err);
      return { error: 'Search failed — check your internet connection.' };
    }
  });

  ipcMain.handle('youtube-prepare-stream', async (event, videoId, force) => {
    if (!videoId || typeof videoId !== 'string') {
      return { error: 'No video selected.' };
    }

    const forceYtDlp = force === true;

    if (!forceYtDlp) {
      try {
        const cobaltStream = await fetchStreamFromCobalt(videoId);
        if (cobaltStream && cobaltStream.streamUrl) {
          return { streamUrl: cobaltStream.streamUrl };
        }
      } catch (err) {
        console.warn(`Cobalt resolution failed for ${videoId}:`, err.message);
      }

      try {
        const pipedStream = await fetchStreamFromPiped(videoId);
        if (pipedStream && pipedStream.streamUrl) {
          return { streamUrl: pipedStream.streamUrl };
        }
      } catch (err) {
        console.warn(`Piped streaming resolution failed in Electron for ${videoId}:`, err.message);
      }
    }

    try {
      console.log(`Bypassing/falling back to yt-dlp in Electron for videoId: ${videoId}`);
      await ensureYtDlp(binDir, ytDlpPath);

      const info = await ytDlpWrap.getVideoInfo([
        `https://www.youtube.com/watch?v=${videoId}`,
        '-f',
        'bestaudio',
        '--no-playlist',
      ]);

      await proxyReady;

      if (!info?.url) {
        return { error: 'No audio stream was returned for this video.' };
      }

      const token = crypto.randomUUID();
      streamTokens.set(token, { url: info.url, headers: info.http_headers || {} });
      setTimeout(() => streamTokens.delete(token), 30 * 60 * 1000);

      const proxyPort = getProxyPort();
      return { streamUrl: `http://127.0.0.1:${proxyPort}/stream/${token}` };
    } catch (err) {
      console.error('yt-dlp failed:', err);
      return {
        error: 'Could not fetch this track. Make sure yt-dlp is available.',
      };
    }
  });

  ipcMain.handle('fetch-lyrics', async (event, title, artist) => {
    try {
      const lyrics = await fetchLyrics(title, artist);
      return lyrics;
    } catch (err) {
      console.error('Lyrics fetch failed:', err);
      return null;
    }
  });

  ipcMain.handle('youtube-import-playlist', async (event, playlistUrl) => {
    if (!playlistUrl || typeof playlistUrl !== 'string') {
      return { error: 'No playlist URL provided.' };
    }

    const trimmed = playlistUrl.trim();
    let playlistId = trimmed;

    if (/^[A-Za-z0-9_-]{18,34}$/.test(trimmed)) {
      playlistId = trimmed;
    } else {
      try {
        const parsed = new URL(trimmed);
        playlistId = parsed.searchParams.get('list') || trimmed;
      } catch (e) {
        return { error: 'Invalid URL. Please enter a valid YouTube or YouTube Music playlist URL.' };
      }
    }

    try {
      const pipedPlaylist = await importPlaylistFromPiped(playlistId);
      if (pipedPlaylist && pipedPlaylist.tracks && pipedPlaylist.tracks.length > 0) {
        return {
          title: pipedPlaylist.title,
          tracks: pipedPlaylist.tracks
        };
      }
    } catch (err) {
      console.warn(`Piped playlist import failed in Electron for list ${playlistId}, falling back to yt-dlp...`, err);
    }

    try {
      console.log(`Bypassing/falling back to yt-dlp playlist extraction in Electron for list: ${playlistId}`);
      await ensureYtDlp(binDir, ytDlpPath);

      const targetUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
      const stdout = await ytDlpWrap.execPromise([
        targetUrl,
        '--flat-playlist',
        '--dump-single-json',
      ]);

      if (!stdout) {
        return { error: 'No data returned from YouTube playlist extractor.' };
      }

      const playlistInfo = JSON.parse(stdout);
      if (!playlistInfo || !playlistInfo.entries) {
        return { error: 'Failed to extract entries from this playlist.' };
      }

      const playlistTitle = playlistInfo.title || 'Imported Playlist';
      const tracks = playlistInfo.entries
        .filter(entry => entry && entry.id)
        .map(entry => {
          const videoId = entry.id;
          const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          return {
            type: 'youtube',
            videoId: videoId,
            name: entry.title || 'Untitled Song',
            artist: entry.uploader || entry.artist || 'Unknown Artist',
            thumbnail: thumbnail
          };
        });

      return {
        title: playlistTitle,
        tracks: tracks
      };
    } catch (err) {
      console.error('Playlist import failed:', err);
      return {
        error: 'Could not fetch the playlist. Make sure the playlist is public or unlisted.'
      };
    }
  });

  ipcMain.handle('youtube-import-liked', async (event, accessToken) => {
    let tokenToUse = accessToken;

    if (!tokenToUse) {
      try {
        tokenToUse = await performGoogleOAuth();
      } catch (err) {
        return { error: err.message || 'Authentication failed.' };
      }
    }

    if (!tokenToUse) {
      return { error: 'Unauthorized: Missing or invalid token.' };
    }

    try {
      let playlistId = 'LM';
      const tracks = [];
      let nextPageToken = '';
      let pagesFetched = 0;
      const maxPages = 3;

      while (pagesFetched < maxPages) {
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
        const result = await getYouTubeApi(url, tokenToUse);

        if (result.statusCode !== 200) {
          break;
        }

        const items = result.data.items || [];
        if (items.length === 0 && pagesFetched === 0) {
          break;
        }

        for (const item of items) {
          const snippet = item.snippet || {};
          const resourceId = snippet.resourceId || {};
          const videoId = resourceId.videoId;
          if (!videoId) continue;

          const title = snippet.title || 'Untitled Song';
          const artist = snippet.videoOwnerChannelTitle || snippet.channelTitle || 'Unknown Artist';
          const thumbnails = snippet.thumbnails || {};
          const thumbnail = (thumbnails.high && thumbnails.high.url) || 
                            (thumbnails.medium && thumbnails.medium.url) || 
                            (thumbnails.default && thumbnails.default.url) || 
                            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

          tracks.push({
            type: 'youtube',
            videoId: videoId,
            name: title,
            artist: artist,
            thumbnail: thumbnail
          });
        }

        nextPageToken = result.data.nextPageToken;
        pagesFetched++;
        if (!nextPageToken) break;
      }

      if (tracks.length === 0) {
        playlistId = 'LL';
        nextPageToken = '';
        pagesFetched = 0;

        while (pagesFetched < maxPages) {
          const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
          const result = await getYouTubeApi(url, tokenToUse);

          if (result.statusCode !== 200) {
            return { 
              error: result.data.error ? result.data.error.message : 'Failed to retrieve liked songs from YouTube.' 
            };
          }

          const items = result.data.items || [];
          for (const item of items) {
            const snippet = item.snippet || {};
            const resourceId = snippet.resourceId || {};
            const videoId = resourceId.videoId;
            if (!videoId) continue;

            const title = snippet.title || 'Untitled Song';
            const artist = snippet.videoOwnerChannelTitle || snippet.channelTitle || 'Unknown Artist';
            const thumbnails = snippet.thumbnails || {};
            const thumbnail = (thumbnails.high && thumbnails.high.url) || 
                              (thumbnails.medium && thumbnails.medium.url) || 
                              (thumbnails.default && thumbnails.default.url) || 
                              `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

            tracks.push({
              type: 'youtube',
              videoId: videoId,
              name: title,
              artist: artist,
              thumbnail: thumbnail
            });
          }

          nextPageToken = result.data.nextPageToken;
          pagesFetched++;
          if (!nextPageToken) break;
        }
      }

      if (tracks.length === 0) {
        return { error: 'No songs found in your Liked Songs playlist on YouTube.' };
      }

      return {
        title: 'YouTube Liked Songs',
        tracks: tracks
      };

    } catch (err) {
      console.error('Liked songs import failed in main process:', err);
      return { error: 'Internal error while fetching liked songs.' };
    }
  });
}

module.exports = {
  registerIpcHandlers
};
