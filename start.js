const { spawn } = require('child_process');
const path = require('path');

// Detect if we are in the cloud container (AI Studio platform workspace / Cloud Run)
const isCloud = !!(process.env.PORT || process.env.K_SERVICE || process.env.AI_STUDIO);

if (isCloud) {
  console.log('--- Server/Cloud Environment Detected ---');
  console.log('Launching Express web server for preview...');
  // Require and run the server.js Express file
  require('./server.js');
} else {
  console.log('--- Desktop/Local Environment Detected ---');
  console.log('Launching native Electron desktop application...');

  let electronPath;
  try {
    electronPath = require('electron');
  } catch (err) {
    console.error('Error: Electron is not installed. Please run "npm install" first.');
    process.exit(1);
  }

  // Spawn the local Electron process pointing to our main script (src/main.js)
  const child = spawn(electronPath, [path.join(__dirname, 'src', 'main.js')], {
    stdio: 'inherit',
    windowsHide: false
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });

  child.on('error', (err) => {
    console.error('Failed to start Electron:', err);
    process.exit(1);
  });
}
