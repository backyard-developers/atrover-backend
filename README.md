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

### Environment Variables

| Variable       | Default                 | Description            |
|----------------|-------------------------|------------------------|
| `COMMAND_PORT` | `8080`                  | Command server port    |
| `MEDIA_PORT`   | `8081`                  | Media server port      |
| `REDIS_URL`    | `redis://localhost:6379`| Redis connection URL   |