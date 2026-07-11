const http = require('http');
const https = require('https');
const { app } = require('electron');

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

module.exports = {
  streamTokens,
  proxyReady,
  getProxyPort: () => proxyPort
};
