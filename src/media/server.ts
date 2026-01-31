import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../config/index.js';
import { handleBinaryMessage, handleTextMessage, handleDisconnect } from './handlers.js';

export function createMediaServer(): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', server: 'media', instanceId: config.instanceId }));
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('Media client connected');
    let roverId: string | undefined;

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        handleBinaryMessage(ws, data, roverId);
      } else {
        roverId = handleTextMessage(ws, data.toString(), roverId);
      }
    });

    ws.on('close', () => {
      console.log('Media client disconnected');
      handleDisconnect(ws, roverId);
    });

    ws.on('error', (err) => {
      console.error('Media WebSocket error:', err);
    });
  });

  return server;
}

export function startMediaServer(): Promise<void> {
  return new Promise((resolve) => {
    const server = createMediaServer();

    server.listen(config.mediaPort, () => {
      console.log(`Media server listening on port ${config.mediaPort}`);
      console.log(`Media WebSocket endpoint: ws://localhost:${config.mediaPort}/ws`);
      resolve();
    });
  });
}
