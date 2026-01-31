import type { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import * as state from '../redis/state.js';
import type { RoverConnection, RoverInfo } from './types.js';

const localRovers: Map<string, RoverConnection> = new Map();

export function createRover(name: string): RoverInfo {
  return {
    id: uuidv4(),
    name,
    connectedAt: Date.now(),
    lastHeartbeat: Date.now(),
    instanceId: config.instanceId,
  };
}

export async function registerRover(info: RoverInfo): Promise<void> {
  const connection: RoverConnection = { info };
  localRovers.set(info.id, connection);
  await state.saveRover(info);
  console.log(`Rover registered: ${info.id} (${info.name})`);
}

export function setCommandSocket(roverId: string, ws: WebSocket): void {
  const rover = localRovers.get(roverId);
  if (rover) {
    rover.commandWs = ws;
  }
}

export function setMediaSocket(roverId: string, ws: WebSocket): void {
  const rover = localRovers.get(roverId);
  if (rover) {
    rover.mediaWs = ws;
  }
}

export async function unregisterRover(roverId: string): Promise<void> {
  localRovers.delete(roverId);
  await state.removeRover(roverId);
  console.log(`Rover unregistered: ${roverId}`);
}

export function getLocalRover(roverId: string): RoverConnection | undefined {
  return localRovers.get(roverId);
}

export function getAllLocalRovers(): RoverConnection[] {
  return Array.from(localRovers.values());
}

export async function updateRoverHeartbeat(roverId: string): Promise<void> {
  const rover = localRovers.get(roverId);
  if (rover) {
    rover.info.lastHeartbeat = Date.now();
    await state.updateHeartbeat(roverId);
  }
}

export async function isRoverLocal(roverId: string): Promise<boolean> {
  return localRovers.has(roverId);
}

export async function getRoverInstance(roverId: string): Promise<string | null> {
  if (localRovers.has(roverId)) {
    return config.instanceId;
  }
  return state.getRoverInstance(roverId);
}

export function sendCommandToRover(roverId: string, command: unknown): boolean {
  const rover = localRovers.get(roverId);
  if (rover?.commandWs && rover.commandWs.readyState === 1) {
    rover.commandWs.send(JSON.stringify(command));
    return true;
  }
  return false;
}

export function sendMediaToRover(roverId: string, data: Buffer): boolean {
  const rover = localRovers.get(roverId);
  if (rover?.mediaWs && rover.mediaWs.readyState === 1) {
    rover.mediaWs.send(data);
    return true;
  }
  return false;
}
