const { app, BrowserWindow } = require('electron');
const { createWindow, registerWindowControls, getMainWindow } = require('./window');
const { registerIpcHandlers } = require('./ipc-handlers');
const { getYtDlpPaths, ensureYtDlp } = require('../shared/ytdlp-manager');

app.whenReady().then(() => {
  createWindow();
  registerWindowControls();
  registerIpcHandlers(getMainWindow);

  // Pre-download yt-dlp asynchronously on desktop app startup
  const { binDir, ytDlpPath } = getYtDlpPaths(true, app);
  ensureYtDlp(binDir, ytDlpPath).catch(err => console.error('Error pre-downloading yt-dlp on startup:', err));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
