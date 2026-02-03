import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../config/index.js';
import { handleMessage, handleDisconnect } from './handlers.js';
import * as state from '../redis/state.js';
import * as roverManager from '../rover/manager.js';
import type { MotorMapping } from './types.js';

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
            + '<td><a href="/dashboard/stream?roverId=' + encodeURIComponent(r.id) + '">Control</a></td>'
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
  <title>ATRover Control</title>
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
    canvas { background: #161b22; border-radius: 8px; display: block; image-rendering: pixelated; transition: transform 0.3s ease; }
    .canvas-wrapper { position: relative; display: inline-block; }
    .rotate-btn { margin-top: 8px; background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #e1e4e8; padding: 8px 16px; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; gap: 6px; }
    .rotate-btn:hover { background: #1c2128; border-color: #58a6ff; }
    .rotate-btn svg { width: 16px; height: 16px; fill: currentColor; }
    #status { margin-bottom: 12px; font-size: 0.85rem; }
    .connecting { color: #d29922; }
    .connected { color: #3fb950; }
    .error { color: #f85149; }
    .main-layout { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
    .stream-panel { flex: 0 0 auto; }
    .control-panel { flex: 0 0 auto; }
    .control-panel h2 { font-size: 1rem; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .controls { display: grid; grid-template-columns: repeat(3, 64px); grid-template-rows: repeat(3, 64px); gap: 6px; }
    .controls button {
      width: 64px; height: 64px; border: 1px solid #30363d; border-radius: 8px;
      background: #161b22; color: #e1e4e8; font-size: 0.75rem; font-weight: 600;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, border-color 0.15s;
      text-transform: uppercase; letter-spacing: 0.03em;
    }
    .controls button:hover { background: #1c2128; border-color: #58a6ff; }
    .controls button:active, .controls button.active { background: #58a6ff; color: #0f1117; border-color: #58a6ff; }
    .controls button:disabled { opacity: 0.3; cursor: not-allowed; }
    .controls button.stop-btn { background: #b62324; border-color: #f85149; }
    .controls button.stop-btn:hover { background: #da3633; }
    .controls button.stop-btn:active, .controls button.stop-btn.active { background: #f85149; color: #0f1117; }
    #cmdStatus { margin-top: 12px; font-size: 0.8rem; color: #8b949e; }
    #cmdLog { margin-top: 8px; max-height: 160px; overflow-y: auto; font-size: 0.75rem; color: #8b949e; font-family: monospace; background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 8px; }
    #cmdLog div { padding: 2px 0; border-bottom: 1px solid #161b22; }
    .key-hint { font-size: 0.65rem; color: #484f58; margin-top: 2px; }
    .motor-config { margin-top: 20px; }
    .motor-config h2 { font-size: 1rem; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .motor-config select { background: #161b22; color: #e1e4e8; border: 1px solid #30363d; border-radius: 6px; padding: 8px 12px; font-size: 0.9rem; margin-right: 8px; }
    .motor-config label { font-size: 0.85rem; color: #8b949e; margin-right: 4px; }
    .motor-config .row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .motor-config button { background: #238636; border: 1px solid #2ea043; border-radius: 6px; color: #fff; padding: 8px 16px; cursor: pointer; font-size: 0.85rem; }
    .motor-config button:hover { background: #2ea043; }
    .motor-config button:disabled { opacity: 0.4; cursor: not-allowed; }
    .motor-config .current { font-size: 0.8rem; color: #8b949e; margin-top: 6px; }
    .motor-config .error { color: #f85149; font-size: 0.8rem; }
  </style>
</head>
<body>
  <a href="/dashboard">&larr; Back to Dashboard</a>
  <h1 id="title">Control</h1>
  <p class="sub" id="roverId"></p>
  <div id="status" class="connecting">Connecting...</div>
  <div class="stats">
    <div class="stat"><div class="label">Video Frames</div><div class="value" id="vFrames">0</div></div>
    <div class="stat"><div class="label">Audio Frames</div><div class="value" id="aFrames">0</div></div>
    <div class="stat"><div class="label">FPS</div><div class="value" id="fps">0</div></div>
    <div class="stat"><div class="label">Throughput</div><div class="value" id="throughput">0 KB/s</div></div>
  </div>
  <div class="main-layout">
    <div class="stream-panel">
      <div class="canvas-wrapper">
        <canvas id="canvas" width="320" height="240"></canvas>
      </div>
      <button id="rotateBtn" class="rotate-btn">
        <svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
        Rotate 90°
      </button>
    </div>
    <div class="control-panel">
      <h2>Rover Controls</h2>
      <div class="controls">
        <button disabled></button>
        <button id="btnForward" data-action="move" data-direction="forward">Fwd<div class="key-hint">W</div></button>
        <button disabled></button>
        <button id="btnLeft" data-action="move" data-direction="left">Left<div class="key-hint">A</div></button>
        <button id="btnStop" class="stop-btn" data-action="stop">Stop<div class="key-hint">S</div></button>
        <button id="btnRight" data-action="move" data-direction="right">Right<div class="key-hint">D</div></button>
        <button disabled></button>
        <button id="btnBackward" data-action="move" data-direction="backward">Back<div class="key-hint">S</div></button>
        <button disabled></button>
      </div>
      <div id="cmdStatus">Command WS: connecting...</div>
      <div id="cmdLog"></div>
    </div>
    <div class="motor-config">
      <h2>Motor Assignment</h2>
      <div class="row">
        <label for="leftMotor">Left:</label>
        <select id="leftMotor">
          <option value="1">Motor 1</option>
          <option value="2">Motor 2</option>
          <option value="3" selected>Motor 3</option>
          <option value="4">Motor 4</option>
        </select>
        <label for="rightMotor">Right:</label>
        <select id="rightMotor">
          <option value="1">Motor 1</option>
          <option value="2">Motor 2</option>
          <option value="3">Motor 3</option>
          <option value="4" selected>Motor 4</option>
        </select>
        <button id="applyMotorConfig">Apply</button>
      </div>
      <div id="motorConfigCurrent" class="current">Current: Left=Motor 3, Right=Motor 4</div>
      <div id="motorConfigError" class="error"></div>
    </div>
  </div>
  <script>
    const params = new URLSearchParams(location.search);
    const roverId = params.get('roverId');
    if (!roverId) { document.getElementById('status').textContent = 'Missing roverId'; }
    document.getElementById('title').textContent = 'Control: ' + (roverId || '?');
    document.getElementById('roverId').textContent = roverId || '';

    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    let videoFrames = 0, audioFrames = 0, totalBytes = 0;
    let fpsCount = 0, lastFpsTime = Date.now();

    /* ---- Camera rotation (frontend-only CSS transform) ---- */
    let rotationDeg = 0;
    document.getElementById('rotateBtn').addEventListener('click', () => {
      rotationDeg = (rotationDeg + 90) % 360;
      canvas.style.transform = 'rotate(' + rotationDeg + 'deg)';
      localStorage.setItem('cameraRotation', rotationDeg);
    });
    // Restore saved rotation on load
    const savedRotation = localStorage.getItem('cameraRotation');
    if (savedRotation) {
      rotationDeg = parseInt(savedRotation, 10) || 0;
      canvas.style.transform = 'rotate(' + rotationDeg + 'deg)';
    }

    function drawFrame(data) {
      const blob = new Blob([data], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }

    /* ---- Command WebSocket (sends controls to rover) ---- */
    let cmdWs;
    const cmdLog = document.getElementById('cmdLog');

    function logCmd(msg) {
      const d = document.createElement('div');
      d.textContent = new Date().toLocaleTimeString() + ' ' + msg;
      cmdLog.prepend(d);
      while (cmdLog.children.length > 50) cmdLog.removeChild(cmdLog.lastChild);
    }

    function connectCommand() {
      if (!roverId) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      cmdWs = new WebSocket(proto + '//' + location.host + '/ws');

      cmdWs.onopen = () => {
        document.getElementById('cmdStatus').textContent = 'Command WS: connected';
        document.getElementById('cmdStatus').style.color = '#3fb950';
        logCmd('Connected to command server');
      };

      cmdWs.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          logCmd('Recv: ' + JSON.stringify(msg));
        } catch {}
      };

      cmdWs.onerror = () => {
        document.getElementById('cmdStatus').textContent = 'Command WS: error';
        document.getElementById('cmdStatus').style.color = '#f85149';
      };

      cmdWs.onclose = () => {
        document.getElementById('cmdStatus').textContent = 'Command WS: disconnected';
        document.getElementById('cmdStatus').style.color = '#f85149';
      };
    }

    function sendCommand(action, direction) {
      if (!cmdWs || cmdWs.readyState !== WebSocket.OPEN) {
        logCmd('Cannot send: command WS not connected');
        return;
      }
      const cmd = { type: 'command', action: action };
      if (direction) cmd.direction = direction;
      const msg = { type: 'command', roverId: roverId, command: cmd };
      cmdWs.send(JSON.stringify(msg));
      const label = action === 'stop' ? 'STOP' : direction.toUpperCase();
      logCmd('Sent: ' + label);
    }

    /* ---- Button handlers ---- */
    document.querySelectorAll('.controls button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        sendCommand(btn.dataset.action, btn.dataset.direction || null);
      });
    });

    /* ---- Keyboard controls (WASD) ---- */
    const keyMap = { w: 'btnForward', a: 'btnLeft', s: 'btnStop', arrowdown: 'btnBackward', d: 'btnRight',
                     arrowup: 'btnForward', arrowleft: 'btnLeft', arrowright: 'btnRight' };
    document.addEventListener('keydown', (e) => {
      const id = keyMap[e.key.toLowerCase()];
      if (!id) return;
      e.preventDefault();
      const btn = document.getElementById(id);
      if (btn && !btn.classList.contains('active')) {
        btn.classList.add('active');
        sendCommand(btn.dataset.action, btn.dataset.direction || null);
      }
    });
    document.addEventListener('keyup', (e) => {
      const id = keyMap[e.key.toLowerCase()];
      if (!id) return;
      const btn = document.getElementById(id);
      if (btn) btn.classList.remove('active');
    });

    /* ---- Media WebSocket (receives stream from rover) ---- */
    async function startMedia() {
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
        document.getElementById('status').textContent = 'Media connected';
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
        document.getElementById('status').textContent = 'Media connection error';
        document.getElementById('status').className = 'error';
      };

      ws.onclose = () => {
        document.getElementById('status').textContent = 'Media disconnected';
        document.getElementById('status').className = 'error';
      };

      window.addEventListener('beforeunload', () => {
        ws.send(JSON.stringify({ type: 'stop_stream', roverId: roverId }));
        ws.close();
        if (cmdWs) cmdWs.close();
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

    /* ---- Motor Config ---- */
    const leftSelect = document.getElementById('leftMotor');
    const rightSelect = document.getElementById('rightMotor');
    const applyBtn = document.getElementById('applyMotorConfig');
    const configCurrent = document.getElementById('motorConfigCurrent');
    const configError = document.getElementById('motorConfigError');

    function updateApplyState() {
      const l = leftSelect.value;
      const r = rightSelect.value;
      applyBtn.disabled = (l === r);
      configError.textContent = (l === r) ? 'Left and right must be different motors' : '';
    }
    leftSelect.addEventListener('change', updateApplyState);
    rightSelect.addEventListener('change', updateApplyState);

    async function loadMotorConfig() {
      if (!roverId) return;
      try {
        const res = await fetch('/api/rovers/' + encodeURIComponent(roverId) + '/motor-config');
        const cfg = await res.json();
        leftSelect.value = cfg.left;
        rightSelect.value = cfg.right;
        configCurrent.textContent = 'Current: Left=Motor ' + cfg.left + ', Right=Motor ' + cfg.right;
        updateApplyState();
      } catch (e) {
        configError.textContent = 'Failed to load motor config';
      }
    }

    applyBtn.addEventListener('click', async () => {
      if (!roverId) return;
      const left = parseInt(leftSelect.value);
      const right = parseInt(rightSelect.value);
      if (left === right) return;
      configError.textContent = '';
      try {
        const res = await fetch('/api/rovers/' + encodeURIComponent(roverId) + '/motor-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ left, right })
        });
        const data = await res.json();
        if (data.ok) {
          configCurrent.textContent = 'Current: Left=Motor ' + left + ', Right=Motor ' + right;
          logCmd('Motor config updated: Left=' + left + ', Right=' + right);
        } else {
          configError.textContent = data.error || 'Update failed';
        }
      } catch (e) {
        configError.textContent = 'Failed to update motor config';
      }
    });

    connectCommand();
    loadMotorConfig();
    startMedia();
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

    // GET /api/rovers/:id/motor-config
    const motorConfigGetMatch = req.url?.match(/^\/api\/rovers\/([^/]+)\/motor-config$/);
    if (motorConfigGetMatch && req.method === 'GET') {
      const roverId = decodeURIComponent(motorConfigGetMatch[1]);
      try {
        const mapping = await state.getMotorMapping(roverId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mapping || { left: 3, right: 4 }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch motor config' }));
      }
      return;
    }

    // POST /api/rovers/:id/motor-config
    const motorConfigPostMatch = req.url?.match(/^\/api\/rovers\/([^/]+)\/motor-config$/);
    if (motorConfigPostMatch && req.method === 'POST') {
      const roverId = decodeURIComponent(motorConfigPostMatch[1]);
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const mapping: MotorMapping = JSON.parse(body);
          if (!mapping || typeof mapping.left !== 'number' || typeof mapping.right !== 'number'
            || mapping.left < 1 || mapping.left > 4 || mapping.right < 1 || mapping.right > 4
            || mapping.left === mapping.right) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid mapping: left and right must be 1-4 and different' }));
            return;
          }
          await roverManager.updateMotorMapping(roverId, mapping);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, mapping }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to update motor config' }));
        }
      });
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
