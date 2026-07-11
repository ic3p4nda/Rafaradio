const { contextBridge, ipcRenderer } = require('electron');

// Anything the renderer (UI) needs from the main process (OS-level stuff)
// gets exposed here, deliberately, instead of turning nodeIntegration on.
contextBridge.exposeInMainWorld('api', {
  openAudioFiles: () => ipcRenderer.invoke('open-audio-files'),
  getTrackMetadata: (filePath) => ipcRenderer.invoke('get-track-metadata', filePath),
  youtubeSearch: (query) => ipcRenderer.invoke('youtube-search', query),
  youtubePrepareStream: (videoId, force) => ipcRenderer.invoke('youtube-prepare-stream', videoId, force),
  youtubeImportPlaylist: (playlistUrl) => ipcRenderer.invoke('youtube-import-playlist', playlistUrl),
  youtubeImportLikedSongs: (accessToken) => ipcRenderer.invoke('youtube-import-liked', accessToken),
  fetchLyrics: (title, artist) => ipcRenderer.invoke('fetch-lyrics', title, artist),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  toggleFullscreenWindow: () => ipcRenderer.send('window-fullscreen-toggle'),
  closeWindow: () => ipcRenderer.send('window-close'),
  toggleMiniPlayer: (isMini) => ipcRenderer.send('window-toggle-mini-player', isMini),
  onFullscreenState: (callback) => ipcRenderer.on('window-fullscreen-state', (event, state) => callback(state)),
});
