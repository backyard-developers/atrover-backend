# Mock Client (`atrover-client-mock/`)

A standalone mock client that simulates a rover sending media streams and a dashboard viewer receiving them. Useful for testing the media streaming pipeline without real hardware.

## Setup

```bash
cd atrover-client-mock
nix develop   # from the project root flake
npm install --save
```

## Running the Rover Mock

```bash
npm run rover
```

Registers with the command server, connects to the media server, and streams simulated video (~15 FPS, 1KB frames) and audio (~30 FPS, 256B frames). Copy the logged `roverId` for the viewer.

## Running the Viewer Mock

```bash
npm run viewer -- <roverId>
```

Subscribes to the rover's stream and prints throughput stats (fps, KB/s) every 5 seconds. Press `Ctrl+C` to send `stop_stream` and disconnect.

## Environment Variables

| Variable       | Default                  | Description              |
|----------------|--------------------------|--------------------------|
| `COMMAND_URL`  | `ws://localhost:8080/ws` | Command server WS URL    |
| `MEDIA_URL`    | `ws://localhost:8081/ws` | Media server WS URL      |
| `ROVER_NAME`   | `MockRover-01`           | Name used at registration|
