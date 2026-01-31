import WebSocket from "ws";
import { COMMAND_URL, MEDIA_URL, ROVER_NAME } from "./config.js";

const VIDEO_FPS = 15;
const AUDIO_FPS = 30;
const VIDEO_FRAME_SIZE = 1024; // ~1KB payload
const AUDIO_FRAME_SIZE = 256;  // ~256B payload
const HEARTBEAT_INTERVAL_MS = 30_000;

let commandWs: WebSocket;
let mediaWs: WebSocket;
let roverId: string;
let heartbeatTimer: ReturnType<typeof setInterval>;
let videoTimer: ReturnType<typeof setInterval>;
let audioTimer: ReturnType<typeof setInterval>;
let videoFrameCount = 0;
let audioFrameCount = 0;

function log(msg: string) {
  console.log(`[rover ${new Date().toISOString()}] ${msg}`);
}

function generateFrame(mediaType: number, size: number): Buffer {
  const buf = Buffer.alloc(1 + size);
  buf[0] = mediaType;
  for (let i = 1; i < buf.length; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
}

function startStreaming() {
  log("Starting media streams...");

  videoTimer = setInterval(() => {
    if (mediaWs.readyState !== WebSocket.OPEN) return;
    const frame = generateFrame(0x01, VIDEO_FRAME_SIZE);
    mediaWs.send(frame);
    videoFrameCount++;
    if (videoFrameCount % 150 === 0) {
      log(`Video frames sent: ${videoFrameCount}`);
    }
  }, Math.round(1000 / VIDEO_FPS));

  audioTimer = setInterval(() => {
    if (mediaWs.readyState !== WebSocket.OPEN) return;
    const frame = generateFrame(0x02, AUDIO_FRAME_SIZE);
    mediaWs.send(frame);
    audioFrameCount++;
    if (audioFrameCount % 300 === 0) {
      log(`Audio frames sent: ${audioFrameCount}`);
    }
  }, Math.round(1000 / AUDIO_FPS));
}

function connectMedia() {
  log(`Connecting to media server: ${MEDIA_URL}`);
  mediaWs = new WebSocket(MEDIA_URL);

  mediaWs.on("open", () => {
    log("Media server connected. Registering...");
    mediaWs.send(JSON.stringify({ type: "register", roverId }));
  });

  mediaWs.on("message", (data, isBinary) => {
    if (isBinary) {
      log(`Received binary from media server: ${(data as Buffer).length} bytes`);
      return;
    }
    const msg = JSON.parse(data.toString());
    log(`Media server message: ${JSON.stringify(msg)}`);

    if (msg.type === "registered") {
      startStreaming();
    }
  });

  mediaWs.on("error", (err) => log(`Media WS error: ${err.message}`));
  mediaWs.on("close", () => log("Media server disconnected."));
}

function connectCommand() {
  log(`Connecting to command server: ${COMMAND_URL}`);
  commandWs = new WebSocket(COMMAND_URL);

  commandWs.on("open", () => {
    log("Command server connected. Registering...");
    commandWs.send(JSON.stringify({ type: "register", name: ROVER_NAME }));
  });

  commandWs.on("message", (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.type === "registered" && msg.roverId) {
      roverId = msg.roverId;
      log(`Registered with roverId: ${roverId}`);

      // Start heartbeat
      heartbeatTimer = setInterval(() => {
        if (commandWs.readyState === WebSocket.OPEN) {
          commandWs.send(JSON.stringify({ type: "heartbeat" }));
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Now connect to media server
      connectMedia();
    } else if (msg.type === "command" || msg.action) {
      const action = msg.action || "unknown";
      const direction = msg.direction || "";
      const speed = msg.speed != null ? ` speed=${msg.speed}` : "";
      console.log(`\n========================================`);
      console.log(`  COMMAND RECEIVED`);
      console.log(`  Action:    ${action}`);
      if (direction) console.log(`  Direction: ${direction}`);
      if (speed) console.log(`  Speed:    ${msg.speed}`);
      console.log(`  Raw:       ${JSON.stringify(msg)}`);
      console.log(`========================================\n`);
    } else if (msg.type !== "heartbeat_ack") {
      log(`Command server message: ${JSON.stringify(msg)}`);
    }
  });

  commandWs.on("error", (err) => log(`Command WS error: ${err.message}`));
  commandWs.on("close", () => log("Command server disconnected."));
}

function shutdown() {
  log("Shutting down...");
  clearInterval(heartbeatTimer);
  clearInterval(videoTimer);
  clearInterval(audioTimer);
  if (mediaWs?.readyState === WebSocket.OPEN) mediaWs.close();
  if (commandWs?.readyState === WebSocket.OPEN) commandWs.close();
  log(`Total video frames sent: ${videoFrameCount}`);
  log(`Total audio frames sent: ${audioFrameCount}`);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

connectCommand();
