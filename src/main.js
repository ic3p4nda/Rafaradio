const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const YTMusic = require('ytmusic-api');
const YTDlpWrap = require('yt-dlp-wrap').default;
const { fetchLyrics, setGeniusApiKey } = require('./lyrics-service');

// ========================================
// GENIUS API KEY - PASTE YOUR KEY HERE
// ========================================
// Get your free key from: https://genius.com/api-clients
const GENIUS_API_KEY = ''; // ← Paste your Genius API token here
if (GENIUS_API_KEY) {
  setGeniusApiKey(GENIUS_API_KEY);
}
// ========================================

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
const ytDlpWrap = new YTDlpWrap();
const streamTokens = new Map(); 
let proxyPort = null;
let resolveProxyReady;
const proxyReady = new Promise((resolve) => {
  resolveProxyReady = resolve;
});

const proxyServer = http.createServer((req, res) => {
  const token = req.url.replace('/stream/', '').split('?')[0];
  const entry = streamTokens.get(token);
  if (!entry) {
    res.writeHead(404);
    res.end('Unknown or expired stream token');
    return;
  }

  const upstreamHeaders = { ...entry.headers };
  if (req.headers.range) upstreamHeaders.range = req.headers.range;

  https
    .get(entry.url, { headers: upstreamHeaders }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
      upstreamRes.pipe(res);
    })
    .on('error', (err) => {
      res.writeHead(502);
      res.end('Upstream fetch failed: ' + err.message);
    });
});

proxyServer.listen(0, '127.0.0.1', () => {
  proxyPort = proxyServer.address().port;
  resolveProxyReady();
});

ipcMain.handle('youtube-prepare-stream', async (event, videoId) => {
  try {
    const info = await ytDlpWrap.getVideoInfo([
      `https://www.youtube.com/watch?v=${videoId}`,
      '-f',
      'bestaudio',
      '--no-playlist',
    ]);

    await proxyReady;

    const token = crypto.randomUUID();
    streamTokens.set(token, { url: info.url, headers: info.http_headers || {} });
    setTimeout(() => streamTokens.delete(token), 30 * 60 * 1000);

    return { streamUrl: `http://127.0.0.1:${proxyPort}/stream/${token}` };
  } catch (err) {
    console.error('yt-dlp failed:', err);
    return {
      error: 'Could not fetch this track. Make sure yt-dlp is installed and on your PATH.',
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
