const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const YTMusic = require('ytmusic-api');
const YTDlpWrap = require('yt-dlp-wrap').default;
const { fetchLyrics } = require('./lyrics-service');

const binDir = path.join(__dirname, '..', 'bin');
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
    backgroundColor: '#05050a',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // mainWindow.webContents.openDevTools();
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
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
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

ipcMain.handle('youtube-prepare-stream', async (event, videoId) => {
  if (!videoId || typeof videoId !== 'string') {
    return { error: 'No video selected.' };
  }

  try {
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
  let targetUrl = trimmed;

  // If only the ID is provided, build a URL
  if (/^[A-Za-z0-9_-]{18,34}$/.test(trimmed)) {
    targetUrl = `https://www.youtube.com/playlist?list=${trimmed}`;
  } else {
    try {
      new URL(trimmed);
    } catch (e) {
      return { error: 'Invalid URL. Please enter a valid YouTube or YouTube Music playlist URL.' };
    }
  }

  try {
    await ensureYtDlp();

    console.log(`Importing playlist from: ${targetUrl}`);
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
