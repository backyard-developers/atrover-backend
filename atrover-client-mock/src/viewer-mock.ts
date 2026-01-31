import WebSocket from "ws";
import { MEDIA_URL } from "./config.js";

const targetRoverId = process.argv[2];
if (!targetRoverId) {
  console.error("Usage: npm run viewer -- <roverId>");
  process.exit(1);
}

let ws: WebSocket;
let videoFrameCount = 0;
let audioFrameCount = 0;
let totalVideoBytes = 0;
let totalAudioBytes = 0;
let startTime = 0;

function log(msg: string) {
  console.log(`[viewer ${new Date().toISOString()}] ${msg}`);
}

function printStats() {
  const elapsed = (Date.now() - startTime) / 1000;
  if (elapsed <= 0) return;
  const videoFps = (videoFrameCount / elapsed).toFixed(1);
  const audioFps = (audioFrameCount / elapsed).toFixed(1);
  const videoKBps = (totalVideoBytes / 1024 / elapsed).toFixed(1);
  const audioKBps = (totalAudioBytes / 1024 / elapsed).toFixed(1);
  log(
    `Stats — Video: ${videoFrameCount} frames (${videoFps} fps, ${videoKBps} KB/s) | ` +
    `Audio: ${audioFrameCount} frames (${audioFps} fps, ${audioKBps} KB/s)`
  );
}

let statsTimer: ReturnType<typeof setInterval>;

function connect() {
  log(`Connecting to media server: ${MEDIA_URL}`);
  log(`Target rover: ${targetRoverId}`);
  ws = new WebSocket(MEDIA_URL);

  ws.on("open", () => {
    log("Connected. Requesting stream...");
    ws.send(
      JSON.stringify({
        type: "start_stream",
        roverId: targetRoverId,
        mediaType: "both",
      })
    );
    startTime = Date.now();
    statsTimer = setInterval(printStats, 5000);
  });

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      const buf = data as Buffer;
      const mediaType = buf[0];
      const payloadSize = buf.length - 1;

      if (mediaType === 0x01) {
        videoFrameCount++;
        totalVideoBytes += payloadSize;
      } else if (mediaType === 0x02) {
        audioFrameCount++;
        totalAudioBytes += payloadSize;
      } else {
        log(`Unknown media type: 0x${mediaType.toString(16)}, size: ${payloadSize}`);
      }
      return;
    }

    const msg = JSON.parse(data.toString());
    log(`Server message: ${JSON.stringify(msg)}`);
  });

  ws.on("error", (err) => log(`WS error: ${err.message}`));
  ws.on("close", () => {
    log("Disconnected from media server.");
    clearInterval(statsTimer);
  });
}

function shutdown() {
  log("Shutting down...");
  clearInterval(statsTimer);
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "stop_stream", roverId: targetRoverId }));
    ws.close();
  }
  printStats();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

connect();
