# Rover Control Server

WebSocket server for real-time Android rover control with video streaming.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Web Dashboard                              │
└─────────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────────┐
│                         Backend                                 │
│                                                                 │
│  ┌────────────────────────┐     ┌────────────────────────────┐  │
│  │    Command Server      │     │      Media Server          │  │
│  │  - Connection mgmt     │     │  - Video streaming         │  │
│  │  - Command routing     │     │  - Audio streaming         │  │
│  │  - Telemetry collection│     │  - Media transcoding       │  │
│  └───────────┬────────────┘     └──────────────┬─────────────┘  │
│              └──────────────┬──────────────────┘                │
│                             ↕                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                         Redis                             │  │
│  │  - Rover state persistence                                │  │
│  │  - Event broadcasting                                     │  │
│  │  - Session management                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────────┐
│                       Rovers (1..N)                             │
│  - Android phone (camera, sensors, connectivity)                │
│  - Arduino (motor control, hardware I/O)                        │
└─────────────────────────────────────────────────────────────────┘
```
### Prerequisites

- Node.js >= 18.0.0
- Redis server

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd atrover-backend

# Install dependencies locally
npm install --save

# Start Redis (if not running)
redis-server --dir ./redis --daemonize yes

# Run in development mode
npm run dev
```

### Using direnv + Nix

```bash
direnv allow
redis-server --dir ./redis --daemonize yes
npm run dev
```

### API Documentation

#### Command Server (port 8080)
- **`GET /docs/command`** — Interactive AsyncAPI UI for command server
- **`GET /docs/command/spec`** — Raw `asyncapi-command.yaml` spec file

#### Media Server (port 8081)
- **`GET /docs/media`** — Interactive AsyncAPI UI for media server
- **`GET /docs/media/spec`** — Raw `asyncapi-media.yaml` spec file

Open `http://localhost:8080/docs/command` or `http://localhost:8081/docs/media` after starting the server.

### Running the Media Server

The media server starts automatically alongside the command server from a single entry point (`src/index.ts`).

```bash
# Start both servers (command + media)
npm run dev
```

This launches:
- **Command server** on `ws://localhost:8080/ws`
- **Media server** on `ws://localhost:8081/ws`

To use custom ports:

```bash
MEDIA_PORT=9081 COMMAND_PORT=9080 npm run dev
```

For production:

```bash
npm run build
node dist/index.js
```

#### Media Server Endpoints

| Endpoint         | URL                              |
|------------------|----------------------------------|
| WebSocket        | `ws://localhost:8081/ws`         |
| Health check     | `GET http://localhost:8081/health`|
| API docs         | `GET http://localhost:8081/docs/media` |

#### Media Protocol

The media server uses a hybrid WebSocket protocol with JSON control messages and binary media frames.

**Control messages (JSON):**

```jsonc
// Rover registers its media socket
{ "type": "register", "roverId": "<uuid>" }

// Client starts receiving a stream
{ "type": "start_stream", "roverId": "<uuid>", "mediaType": "video" | "audio" | "both" }

// Client stops receiving a stream
{ "type": "stop_stream", "roverId": "<uuid>" }
```

**Binary frames:**

| Byte 0 (header) | Meaning     |
|------------------|-------------|
| `0x01`           | Video frame |
| `0x02`           | Audio frame |

Bytes 1+ contain the raw frame data.

#### Testing with Mock Clients

The `atrover-client-mock/` directory provides mock rover and viewer clients for testing.

```bash
cd atrover-client-mock
npm install

# Terminal 1 — simulate a rover streaming media
npm run rover

# Terminal 2 — simulate a viewer (use the roverId printed by the rover mock)
npm run viewer -- <roverId>
```

Mock client environment variables:

| Variable      | Default                      | Description         |
|---------------|------------------------------|---------------------|
| `COMMAND_URL` | `ws://localhost:8080/ws`     | Command server URL  |
| `MEDIA_URL`   | `ws://localhost:8081/ws`     | Media server URL    |
| `ROVER_NAME`  | `MockRover-01`               | Rover display name  |

### Environment Variables

| Variable       | Default                 | Description            |
|----------------|-------------------------|------------------------|
| `COMMAND_PORT` | `8080`                  | Command server port    |
| `MEDIA_PORT`   | `8081`                  | Media server port      |
| `REDIS_URL`    | `redis://localhost:6379`| Redis connection URL   |
