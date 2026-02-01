import type { WebSocket } from 'ws';
import * as roverManager from '../rover/manager.js';
import { publish } from '../redis/pubsub.js';
import type { IncomingMessage, MotorMapping } from './types.js';

export async function handleMessage(ws: WebSocket, data: string, roverId?: string): Promise<string | undefined> {
  let message: IncomingMessage;

  try {
    message = JSON.parse(data);
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    return roverId;
  }

  switch (message.type) {
    case 'register': {
      const info = roverManager.createRover(message.name);
      await roverManager.registerRover(info);
      roverManager.setCommandSocket(info.id, ws);

      ws.send(JSON.stringify({
        type: 'registered',
        roverId: info.id,
      }));

      await publish('rover:events', JSON.stringify({
        event: 'rover:connected',
        roverId: info.id,
        name: message.name,
      }));

      // Push stored motor config to rover if available
      const storedMapping = await roverManager.getMotorMapping(info.id);
      if (storedMapping) {
        ws.send(JSON.stringify({
          type: 'motor_config',
          mapping: storedMapping,
        }));
      }

      return info.id;
    }

    case 'heartbeat': {
      if (roverId) {
        await roverManager.updateRoverHeartbeat(roverId);
        ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
      }
      return roverId;
    }

    case 'command': {
      const sent = roverManager.sendCommandToRover(message.roverId, message.command);

      if (!sent) {
        await publish('rover:commands', JSON.stringify({
          targetRoverId: message.roverId,
          command: message.command,
        }));
      }

      ws.send(JSON.stringify({
        type: 'command_ack',
        roverId: message.roverId,
      }));

      return roverId;
    }

    case 'motor_config_update': {
      const mapping = (message as any).mapping as MotorMapping;
      const targetRoverId = (message as any).roverId as string;

      // Validate
      if (!mapping || typeof mapping.left !== 'number' || typeof mapping.right !== 'number'
        || mapping.left < 1 || mapping.left > 4 || mapping.right < 1 || mapping.right > 4
        || mapping.left === mapping.right) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid motor mapping: left and right must be 1-4 and different' }));
        return roverId;
      }

      await roverManager.updateMotorMapping(targetRoverId, mapping);

      ws.send(JSON.stringify({ type: 'motor_config_ack', mapping }));
      return roverId;
    }

    case 'motor_config_request': {
      const reqRoverId = (message as any).roverId as string;
      const currentMapping = await roverManager.getMotorMapping(reqRoverId);
      ws.send(JSON.stringify({
        type: 'motor_config',
        mapping: currentMapping || { left: 3, right: 4 },
      }));
      return roverId;
    }

    default: {
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      return roverId;
    }
  }
}

export async function handleDisconnect(roverId: string | undefined): Promise<void> {
  if (roverId) {
    await roverManager.unregisterRover(roverId);

    await publish('rover:events', JSON.stringify({
      event: 'rover:disconnected',
      roverId,
    }));
  }
}
