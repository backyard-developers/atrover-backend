# Redis

Redis data is stored in this folder.

## Commands

### Check if running
```bash
redis-cli ping          # Returns "PONG" if running
pgrep -a redis-server   # Shows process if running
```

### Start Redis
```bash
redis-server                  # Foreground (blocks terminal)
redis-server --daemonize yes  # Background (daemon mode)
```

To start Redis with data saved to this folder:
```bash
redis-server --dir ./redis --daemonize yes
```

### Shutdown Redis
```bash
redis-cli shutdown         # Graceful shutdown (saves data first)
redis-cli shutdown nosave  # Shutdown without saving
```

### Check status
```bash
redis-cli info server   # Detailed server info
```

## Data persistence

Redis stores data in memory but persists to disk via:

- **RDB** (`dump.rdb`) - Point-in-time snapshots
- **AOF** (`appendonly.aof`) - Append-only log of write operations

Data files in this folder are gitignored.
