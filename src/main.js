const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const YTMusic = require('ytmusic-api');
const YTDlpWrap = require('yt-dlp-wrap').default;
const { fetchLyrics } = require('./lyrics-service');

const userDataPath = app.getPath('userData');
const binDir = path.join(userDataPath, 'bin');
const ytDlpPath = path.join(binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const ytDlpWrap = new YTDlpWrap(ytDlpPath);

async function ensureYtDlp() {
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  if (!fs.existsSync(ytDlpPath)) {
    console.log('Downloading yt-dlp binary from GitHub for Electron...');
    try {
      await YTDlpWrap.downloadFromGithub(ytDlpPath);
      console.log('Downloaded yt-dlp successfully!');
      if (process.platform !== 'win32') {
        fs.chmodSync(ytDlpPath, '755'); // Make it executable
      }
    } catch (err) {
      console.error('Failed to download yt-dlp:', err);
    }
  }
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 820,
    minHeight: 560,
    transparent: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('window-fullscreen-state', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('window-fullscreen-state', false);
  });
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-fullscreen-state', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-fullscreen-state', false);
  });

  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  // Pre-download yt-dlp asynchronously on desktop app startup
  ensureYtDlp().catch(err => console.error('Error pre-downloading yt-dlp on startup:', err));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-fullscreen-toggle', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow.close());

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

ipcMain.handle('open-audio-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select audio files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'm4a', 'ogg'] }],
  });

  if (result.canceled) return [];
  return result.filePaths;
});

let ytMusicInstance = null;
async function getYTMusic() {
  if (!ytMusicInstance) {
    ytMusicInstance = new YTMusic();
    await ytMusicInstance.initialize();
  }
  return ytMusicInstance;
}

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
const streamTokens = new Map(); 
let proxyPort = null;
let resolveProxyReady;
const proxyReady = new Promise((resolve) => {
  resolveProxyReady = resolve;
});

const proxyServer = http.createServer((req, res) => {
  let pathname = '/';
  try {
    pathname = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`).pathname;
  } catch {
    pathname = req.url || '/';
  }

  const token = pathname.replace(/^\/stream\//, '').split('/')[0];
  const entry = streamTokens.get(token);
  if (!entry) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Unknown or expired stream token');
    return;
  }

  const upstreamHeaders = { ...entry.headers };
  if (req.headers.range) upstreamHeaders.range = req.headers.range;

  https
    .get(entry.url, { headers: upstreamHeaders }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    })
    .on('error', (err) => {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Upstream fetch failed: ' + err.message);
    });
});

proxyServer.on('error', (err) => {
  console.error('Proxy server error:', err);
});

proxyServer.listen(0, '127.0.0.1', () => {
  proxyPort = proxyServer.address().port;
  resolveProxyReady();
});

app.on('before-quit', () => {
  streamTokens.clear();
  try {
    proxyServer.close();
  } catch (err) {
    console.warn('Failed to close proxy server cleanly:', err);
  }
});

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.lunar.icu',
  'https://api.piped.yt',
  'https://piped-api.glg.id',
  'https://piped-api.rirsh.de',
  'https://piped-api.privacydev.net',
  'https://pipedapi.tokhmi.xyz',
  'https://piped-api.ch7.io',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.colby.rat',
  'https://piped-api.swish-swish.xyz'
];

const COBALT_INSTANCES = [
  'https://api.cobalt.tools/api/json',
  'https://cobalt.as93.net/api/json'
];

function requestJson(url, options = {}, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let timer;
    try {
      const urlObj = new URL(url);
      const reqOptions = {
        method: options.method || 'GET',
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...(options.headers || {})
        },
        timeout: timeoutMs
      };

      const req = https.request(reqOptions, (res) => {
        clearTimeout(timer);
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Status: ${res.statusCode}`));
          }
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e.message}`));
          }
        });
      });

      req.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }

      req.end();

      timer = setTimeout(() => {
        req.destroy();
        reject(new Error('Request timed out'));
      }, timeoutMs);
    } catch (err) {
      reject(err);
    }
  });
}

async function fetchStreamFromCobalt(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const payload = {
    url: url,
    downloadMode: 'audio',
    audioFormat: 'mp3',
    audioQuality: 'best'
  };

  for (const instance of COBALT_INSTANCES) {
    try {
      console.log(`Trying Cobalt resolution on: ${instance} for videoId: ${videoId}`);
      const res = await requestJson(instance, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      }, 3500);

      if (res && (res.status === 'stream' || res.status === 'redirect') && res.url) {
        console.log(`Cobalt resolution succeeded via ${instance}`);
        return { streamUrl: res.url };
      }
    } catch (err) {
      console.warn(`Cobalt instance ${instance} failed:`, err.message);
    }
  }
  return null;
}

async function fetchStreamFromPiped(videoId) {
  const shuffled = [...PIPED_INSTANCES].sort(() => 0.5 - Math.random());
  const candidates = shuffled.slice(0, 4);

  const attemptInstance = async (instance) => {
    try {
      const data = await requestJson(`${instance}/streams/${videoId}`, {}, 3000);
      if (data && data.audioStreams && data.audioStreams.length > 0) {
        const streams = data.audioStreams.filter(s => s.url);
        if (streams.length > 0) {
          streams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          return {
            streamUrl: streams[0].url,
            title: data.title,
            duration: data.duration,
            thumbnail: data.thumbnailUrl,
            instance: instance
          };
        }
      }
      throw new Error(`Instance ${instance} returned no audio streams`);
    } catch (err) {
      throw err;
    }
  };

  try {
    const result = await Promise.any(candidates.map(candidate => attemptInstance(candidate)));
    console.log(`Piped resolution succeeded via ${result.instance} for videoId: ${videoId}`);
    return result;
  } catch (err) {
    console.warn(`Piped resolution race failed for videoId: ${videoId}. Errors:`, err);
    const remaining = shuffled.slice(4);
    for (const candidate of remaining) {
      try {
        const res = await attemptInstance(candidate);
        console.log(`Piped resolution succeeded on fallback candidate ${candidate} for videoId: ${videoId}`);
        return res;
      } catch (e) {
        console.warn(`Fallback candidate ${candidate} failed:`, e.message);
      }
    }
  }
  return null;
}

async function importPlaylistFromPiped(playlistId) {
  const shuffled = [...PIPED_INSTANCES].sort(() => 0.5 - Math.random());
  const candidates = shuffled.slice(0, 3);

  const attemptInstance = async (instance) => {
    try {
      const data = await requestJson(`${instance}/playlists/${playlistId}`, {}, 4000);
      if (data && data.relatedStreams && data.relatedStreams.length > 0) {
        const title = data.name || 'Imported Playlist';
        const tracks = data.relatedStreams
          .filter(item => item && item.url)
          .map(item => {
            let videoId = '';
            try {
              if (item.url.includes('?v=')) {
                videoId = item.url.split('?v=')[1].split('&')[0];
              } else {
                videoId = item.url.replace('/watch?v=', '');
              }
            } catch (e) {}

            if (!videoId) return null;

            return {
              type: 'youtube',
              videoId: videoId,
              name: item.title || 'Untitled Song',
              artist: item.uploaderName || 'Unknown Artist',
              thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
            };
          })
          .filter(Boolean);

        if (tracks.length > 0) {
          return {
            title: title,
            tracks: tracks,
            instance: instance
          };
        }
      }
      throw new Error(`Instance ${instance} returned no valid playlist tracks`);
    } catch (err) {
      throw err;
    }
  };

  try {
    const result = await Promise.any(candidates.map(candidate => attemptInstance(candidate)));
    console.log(`Piped playlist import succeeded via ${result.instance} for playlistId: ${playlistId}`);
    return result;
  } catch (err) {
    console.warn(`Piped playlist import race failed for playlistId: ${playlistId}. Errors:`, err);
    const remaining = shuffled.slice(3);
    for (const candidate of remaining) {
      try {
        const res = await attemptInstance(candidate);
        console.log(`Piped playlist import succeeded on fallback candidate ${candidate} for playlistId: ${playlistId}`);
        return res;
      } catch (e) {
        console.warn(`Fallback playlist candidate ${candidate} failed:`, e.message);
      }
    }
  }
  return null;
}

ipcMain.handle('youtube-prepare-stream', async (event, videoId, force) => {
  if (!videoId || typeof videoId !== 'string') {
    return { error: 'No video selected.' };
  }

  const forceYtDlp = force === true;

  // 1. Try fast providers first (skip if force requested)
  if (!forceYtDlp) {
    // 1a. Cobalt (Instant stream, high availability)
    try {
      const cobaltStream = await fetchStreamFromCobalt(videoId);
      if (cobaltStream && cobaltStream.streamUrl) {
        return { streamUrl: cobaltStream.streamUrl };
      }
    } catch (err) {
      console.warn(`Cobalt resolution failed for ${videoId}:`, err.message);
    }

    // 1b. Piped (Parallel raced request over reliable instances)
    try {
      const pipedStream = await fetchStreamFromPiped(videoId);
      if (pipedStream && pipedStream.streamUrl) {
        return { streamUrl: pipedStream.streamUrl };
      }
    } catch (err) {
      console.warn(`Piped streaming resolution failed in Electron for ${videoId}:`, err.message);
    }
  }

  // 2. Fallback to yt-dlp
  try {
    console.log(`Bypassing/falling back to yt-dlp in Electron for videoId: ${videoId}`);
    await ensureYtDlp();

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

  // If only the ID is provided, keep it, otherwise parse list ID from query string
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

  // 1. Try Piped Playlist Importer first (lightning fast!)
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

  // 2. Fallback to yt-dlp
  try {
    console.log(`Bypassing/falling back to yt-dlp playlist extraction in Electron for list: ${playlistId}`);
    await ensureYtDlp();

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

function getYouTubeApi(url, accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => reject(err));
  });
}

const OAUTH_LOOPBACK_PORT = 8721;

function performGoogleOAuth() {
  return new Promise((resolve, reject) => {
    try {
      let configPath;

      // Dynamically checks if the app is packaged
      if (app.isPackaged) {
        // When built, files listed in extraResources go to the app's resources folder
        configPath = path.join(process.resourcesPath, 'firebase-applet-config.json');
      } else {
        // In development, step back one folder from src/main.js to find the project root
        configPath = path.join(__dirname, '..', 'firebase-applet-config.json');
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