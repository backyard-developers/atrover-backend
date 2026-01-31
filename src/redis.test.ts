import { describe, it, expect, afterAll } from 'vitest';
import Redis from 'ioredis';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('Redis persistence', () => {
  let redis: Redis;
  let rdbPath: string;

  afterAll(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  it('should create dump.rdb after BGSAVE', async () => {
    redis = new Redis();

    // Get Redis data directory
    const dirConfig = await redis.config('GET', 'dir');
    const redisDir = dirConfig[1] as string;
    rdbPath = join(redisDir, 'dump.rdb');

    // Remove existing dump.rdb if present
    if (existsSync(rdbPath)) {
      unlinkSync(rdbPath);
    }

    // Write some data
    await redis.set('test-key', 'test-value');

    // Trigger a background save
    await redis.bgsave();

    // Wait for the save to complete (check LASTSAVE timestamp changes)
    const startTime = await redis.lastsave();
    let saved = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const currentTime = await redis.lastsave();
      if (currentTime > startTime) {
        saved = true;
        break;
      }
    }

    expect(saved).toBe(true);
    expect(existsSync(rdbPath)).toBe(true);
  });
});
