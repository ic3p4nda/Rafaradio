const path = require('path');
const fs = require('fs');
const os = require('os');
const YTDlpWrap = require('yt-dlp-wrap').default;

function getYtDlpPaths(isElectron = false, app = null) {
  let userDataPath;
  if (isElectron && app) {
    try {
      userDataPath = app.getPath('userData');
    } catch (e) {
      userDataPath = path.join(os.tmpdir(), 'rafaradio');
    }
  } else {
    userDataPath = path.join(os.tmpdir(), 'rafaradio');
  }
  const binDir = path.join(userDataPath, 'bin');
  const ytDlpPath = path.join(binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  return { binDir, ytDlpPath };
}

async function ensureYtDlp(binDir, ytDlpPath) {
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  if (!fs.existsSync(ytDlpPath)) {
    console.log(`Downloading yt-dlp binary from GitHub to: ${ytDlpPath}`);
    try {
      await YTDlpWrap.downloadFromGithub(ytDlpPath);
      console.log('Downloaded yt-dlp successfully!');
      if (process.platform !== 'win32') {
        fs.chmodSync(ytDlpPath, '755'); // Make it executable
      }
    } catch (err) {
      console.error('Failed to download yt-dlp:', err);
      throw err;
    }
  }
}

module.exports = {
  getYtDlpPaths,
  ensureYtDlp
};
