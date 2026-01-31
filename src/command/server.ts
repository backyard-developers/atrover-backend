import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../config/index.js';
import { handleMessage, handleDisconnect } from './handlers.js';

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

export function createCommandServer(): http.Server {
  const server = http.createServer((req, res) => {
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
