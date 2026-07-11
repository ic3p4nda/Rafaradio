const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;
let normalBounds = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 820,
    minHeight: 560,
    transparent: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

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
  
  return mainWindow;
}

function registerWindowControls() {
  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });
  
  ipcMain.on('window-fullscreen-toggle', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  
  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.on('window-toggle-mini-player', (event, isMini) => {
    if (!mainWindow) return;
    if (isMini) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      }
      normalBounds = mainWindow.getBounds();
      mainWindow.setMinimumSize(300, 110);
      mainWindow.setBounds({
        x: normalBounds.x + Math.floor((normalBounds.width - 380) / 2),
        y: normalBounds.y + Math.floor((normalBounds.height - 140) / 2),
        width: 380,
        height: 140
      });
      mainWindow.setAlwaysOnTop(true, 'floating');
    } else {
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setMinimumSize(820, 560);
      if (normalBounds) {
        mainWindow.setBounds(normalBounds);
      } else {
        mainWindow.setBounds({ width: 1200, height: 750 });
        mainWindow.center();
      }
    }
  });
}

module.exports = {
  createWindow,
  registerWindowControls,
  getMainWindow: () => mainWindow
};
