import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../config/index.js';
import { handleMessage, handleDisconnect } from './handlers.js';
import * as state from '../redis/state.js';

const ASYNCAPI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ATRover Command Server API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/@asyncapi/react-component@2/styles/default.min.css">
  <style>
    html, body { margin: 0; padding: 0; font-family: sans-serif; }
  </style>
</head>
<body>
  <div id="asyncapi"></div>
  <script src="https://unpkg.com/js-yaml@4/dist/js-yaml.min.js"></script>
  <script src="https://unpkg.com/@asyncapi/react-component@2/browser/standalone/index.js"></script>
  <script>
    fetch('/docs/command/spec')
      .then(r => r.text())
      .then(yaml => {
        const schema = jsyaml.load(yaml);
        AsyncApiStandalone.render({ schema, config: { show: { sidebar: true } } }, document.getElementById('asyncapi'));
      });
  </script>
</body>
</html>`;

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ATRover Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1117; color: #e1e4e8; padding: 24px; }
    h1 { font-size: 1.5rem; margin-bottom: 16px; color: #58a6ff; }
    table { width: 100%; border-collapse: collapse; background: #161b22; border-radius: 8px; overflow: hidden; }
    th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid #21262d; }
    th { background: #1c2128; color: #8b949e; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
    td { font-size: 0.9rem; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .status { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; }
    .status.online { background: #3fb950; }
    .status.stale { background: #d29922; }
    .status.offline { background: #f85149; }
    #empty { text-align: center; padding: 48px; color: #8b949e; }
  </style>
</head>
<body>
  <h1>ATRover Dashboard</h1>
  <table>
    <thead><tr><th>Status</th><th>Name</th><th>Rover ID</th><th>Last Heartbeat</th><th>Stream</th></tr></thead>
    <tbody id="rovers"></tbody>
  </table>
  <div id="empty" style="display:none">No rovers connected</div>
  <script>
    function statusClass(ts) {
      const age = Date.now() - ts;
      if (age < 15000) return 'online';
      if (age < 60000) return 'stale';
      return 'offline';
    }
    function timeAgo(ts) {
      const s = Math.floor((Date.now() - ts) / 1000);
      if (s < 5) return 'just now';
      if (s < 60) return s + 's ago';
      return Math.floor(s / 60) + 'm ago';
    }
    async function refresh() {
      try {
        const res = await fetch('/api/rovers');
        const rovers = await res.json();
        const tbody = document.getElementById('rovers');
        const empty = document.getElementById('empty');
        if (rovers.length === 0) {
          tbody.innerHTML = '';
          empty.style.display = 'block';
          return;
        }
        empty.style.display = 'none';
        tbody.innerHTML = rovers.map(r => {
          const sc = statusClass(r.lastHeartbeat);
          return '<tr>'
            + '<td><span class="status ' + sc + '"></span>' + sc + '</td>'
            + '<td>' + r.name + '</td>'
            + '<td><code>' + r.id + '</code></td>'
            + '<td>' + timeAgo(r.lastHeartbeat) + '</td>'
            + '<td><a href="/dashboard/stream?roverId=' + encodeURIComponent(r.id) + '">Watch</a></td>'
            + '</tr>';
        }).join('');
      } catch (e) {
        console.error('Failed to fetch rovers', e);
      }
    }
    refresh();
    setInterval(refresh, 3000);
  </script>
</body>
</html>`;

const STREAM_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ATRover Stream</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1117; color: #e1e4e8; padding: 24px; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; color: #58a6ff; }
    .sub { color: #8b949e; font-size: 0.85rem; margin-bottom: 16px; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .stats { display: flex; gap: 24px; margin-bottom: 16px; flex-wrap: wrap; }
    .stat { background: #161b22; border-radius: 8px; padding: 12px 20px; }
    .stat .label { font-size: 0.75rem; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat .value { font-size: 1.4rem; font-weight: 600; margin-top: 2px; }
    canvas { background: #161b22; border-radius: 8px; display: block; image-rendering: pixelated; }
    #status { margin-bottom: 12px; font-size: 0.85rem; }
    .connecting { color: #d29922; }
    .connected { color: #3fb950; }
    .error { color: #f85149; }
  </style>
</head>
<body>
  <a href="/dashboard">&larr; Back to Dashboard</a>
  <h1 id="title">Stream</h1>
  <p class="sub" id="roverId"></p>
  <div id="status" class="connecting">Connecting...</div>
  <div class="stats">
    <div class="stat"><div class="label">Video Frames</div><div class="value" id="vFrames">0</div></div>
    <div class="stat"><div class="label">Audio Frames</div><div class="value" id="aFrames">0</div></div>
    <div class="stat"><div class="label">FPS</div><div class="value" id="fps">0</div></div>
    <div class="stat"><div class="label">Throughput</div><div class="value" id="throughput">0 KB/s</div></div>
  </div>
  <canvas id="canvas" width="320" height="240"></canvas>
  <script>
    const params = new URLSearchParams(location.search);
    const roverId = params.get('roverId');
    if (!roverId) { document.getElementById('status').textContent = 'Missing roverId'; }
    document.getElementById('title').textContent = 'Stream: ' + (roverId || '?');
    document.getElementById('roverId').textContent = roverId || '';

    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    let videoFrames = 0, audioFrames = 0, totalBytes = 0;
    let fpsCount = 0, lastFpsTime = Date.now();

    function drawFrame(data) {
      const imgData = ctx.createImageData(canvas.width, canvas.height);
      const pixels = canvas.width * canvas.height;
      for (let i = 0; i < pixels; i++) {
        const v = i < data.length ? data[i] : 0;
        imgData.data[i * 4] = v;
        imgData.data[i * 4 + 1] = v;
        imgData.data[i * 4 + 2] = v;
        imgData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    async function start() {
      if (!roverId) return;
      let mediaUrl;
      try {
        const res = await fetch('/api/rovers');
        const rovers = await res.json();
        const rover = rovers.find(r => r.id === roverId);
        mediaUrl = rover && rover.mediaUrl;
      } catch (e) {
        document.getElementById('status').textContent = 'Failed to fetch rover info';
        document.getElementById('status').className = 'error';
        return;
      }

      if (!mediaUrl) {
        document.getElementById('status').textContent = 'No media URL for this rover';
        document.getElementById('status').className = 'error';
        return;
      }

      const ws = new WebSocket(mediaUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        document.getElementById('status').textContent = 'Connected';
        document.getElementById('status').className = 'connected';
        ws.send(JSON.stringify({ type: 'start_stream', roverId: roverId, mediaType: 'both' }));
      };

      ws.onmessage = (e) => {
        if (typeof e.data === 'string') return;
        const buf = new Uint8Array(e.data);
        if (buf.length < 2) return;
        const mediaType = buf[0];
        const frameData = buf.slice(1);
        totalBytes += frameData.length;

        if (mediaType === 1) {
          videoFrames++;
          fpsCount++;
          drawFrame(frameData);
          document.getElementById('vFrames').textContent = videoFrames;
        } else if (mediaType === 2) {
          audioFrames++;
          document.getElementById('aFrames').textContent = audioFrames;
        }
      };

      ws.onerror = () => {
        document.getElementById('status').textContent = 'Connection error';
        document.getElementById('status').className = 'error';
      };

      ws.onclose = () => {
        document.getElementById('status').textContent = 'Disconnected';
        document.getElementById('status').className = 'error';
      };

      window.addEventListener('beforeunload', () => {
        ws.send(JSON.stringify({ type: 'stop_stream', roverId: roverId }));
        ws.close();
      });
    }

    setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastFpsTime) / 1000;
      document.getElementById('fps').textContent = Math.round(fpsCount / elapsed);
      document.getElementById('throughput').textContent = (totalBytes / elapsed / 1024).toFixed(1) + ' KB/s';
      fpsCount = 0;
      totalBytes = 0;
      lastFpsTime = now;
    }, 1000);

    start();
  </script>
</body>
</html>`;

export function createCommandServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', server: 'command', instanceId: config.instanceId }));
      return;
    }

    if (req.url === '/docs/command') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(ASYNCAPI_HTML);
      return;
    }

    if (req.url === '/docs/command/spec') {
      try {
        const specPath = path.resolve('asyncapi-command.yaml');
        const yaml = fs.readFileSync(specPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/yaml' });
        res.end(yaml);
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read asyncapi-command.yaml' }));
      }
      return;
    }

    if (req.url === '/api/rovers') {
      try {
        const ids = await state.getAllRovers();
        const rovers = await Promise.all(ids.map((id) => state.getRover(id)));
        const result = rovers
          .filter((r) => r !== null)
          .map((r) => ({
            id: r.id,
            name: r.name,
            connectedAt: r.connectedAt,
            lastHeartbeat: r.lastHeartbeat,
            mediaUrl: r.mediaUrl || null,
          }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch rovers' }));
      }
      return;
    }

    if (req.url === '/dashboard') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(DASHBOARD_HTML);
      return;
    }

    if (req.url?.startsWith('/dashboard/stream')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(STREAM_HTML);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('Command client connected');
    let roverId: string | undefined;

    ws.on('message', async (data: Buffer) => {
      roverId = await handleMessage(ws, data.toString(), roverId);
    });

    ws.on('close', async () => {
      console.log('Command client disconnected');
      await handleDisconnect(roverId);
    });

    ws.on('error', (err) => {
      console.error('Command WebSocket error:', err);
    });
  });

  return server;
}

export function startCommandServer(): Promise<void> {
  return new Promise((resolve) => {
    const server = createCommandServer();

    server.listen(config.commandPort, () => {
      console.log(`Command server listening on port ${config.commandPort}`);
      console.log(`Command WebSocket endpoint: ws://localhost:${config.commandPort}/ws`);
      resolve();
    });
  });
}
