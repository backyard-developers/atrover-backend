import { getRedisClient } from './client.js';
import { config } from '../config/index.js';
import type { RoverInfo } from '../rover/types.js';

const ROVER_TTL = 300; // 5 minutes

const KEYS = {
  ROVER: (id: string) => `rover:${id}`,
  ROVER_INSTANCE: (id: string) => `rover:${id}:instance`,
  INSTANCE_ROVERS: (instanceId: string) => `instance:${instanceId}:rovers`,
  ALL_ROVERS: 'rovers:all',
};

export async function saveRover(rover: RoverInfo): Promise<void> {
  const client = getRedisClient();

  const data = {
    id: rover.id,
    name: rover.name,
    connectedAt: rover.connectedAt,
    lastHeartbeat: rover.lastHeartbeat,
    instanceId: rover.instanceId,
  };

  const pipeline = client.pipeline();
  pipeline.hset(KEYS.ROVER(rover.id), data);
  pipeline.expire(KEYS.ROVER(rover.id), ROVER_TTL);
  pipeline.set(KEYS.ROVER_INSTANCE(rover.id), rover.instanceId, 'EX', ROVER_TTL);
  pipeline.sadd(KEYS.ALL_ROVERS, rover.id);
  pipeline.sadd(KEYS.INSTANCE_ROVERS(rover.instanceId), rover.id);

  await pipeline.exec();
}

export async function removeRover(roverId: string): Promise<void> {
  const client = getRedisClient();

  const instanceId = await client.get(KEYS.ROVER_INSTANCE(roverId));

  const pipeline = client.pipeline();
  pipeline.del(KEYS.ROVER(roverId));
  pipeline.del(KEYS.ROVER_INSTANCE(roverId));
  pipeline.srem(KEYS.ALL_ROVERS, roverId);

  if (instanceId) {
    pipeline.srem(KEYS.INSTANCE_ROVERS(instanceId), roverId);
  }

  await pipeline.exec();
}

export async function getRover(roverId: string): Promise<RoverInfo | null> {
  const client = getRedisClient();
  const data = await client.hgetall(KEYS.ROVER(roverId));

  if (!data || !data.id) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    connectedAt: parseInt(data.connectedAt, 10),
    lastHeartbeat: parseInt(data.lastHeartbeat, 10),
    instanceId: data.instanceId,
  };
}

export async function getRoverInstance(roverId: string): Promise<string | null> {
  const client = getRedisClient();
  return client.get(KEYS.ROVER_INSTANCE(roverId));
}

export async function getAllRovers(): Promise<string[]> {
  const client = getRedisClient();
  return client.smembers(KEYS.ALL_ROVERS);
}

export async function getInstanceRovers(instanceId: string = config.instanceId): Promise<string[]> {
  const client = getRedisClient();
  return client.smembers(KEYS.INSTANCE_ROVERS(instanceId));
}

export async function updateHeartbeat(roverId: string): Promise<void> {
  const client = getRedisClient();
  const now = Date.now();

  const pipeline = client.pipeline();
  pipeline.hset(KEYS.ROVER(roverId), 'lastHeartbeat', now);
  pipeline.expire(KEYS.ROVER(roverId), ROVER_TTL);
  pipeline.expire(KEYS.ROVER_INSTANCE(roverId), ROVER_TTL);

  await pipeline.exec();
}
