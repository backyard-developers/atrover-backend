import type { WebSocket } from 'ws';

export interface RoverInfo {
  id: string;
  name: string;
  connectedAt: number;
  lastHeartbeat: number;
  instanceId: string;
  mediaUrl?: string;
  motorMapping?: { left: number; right: number };
}

export interface RoverConnection {
  info: RoverInfo;
  commandWs?: WebSocket;
  mediaWs?: WebSocket;
}

export interface RoverTelemetry {
  type: 'telemetry';
  roverId: string;
  timestamp: number;
  data: {
    battery?: number;
    speed?: number;
    heading?: number;
    location?: {
      lat: number;
      lng: number;
    };
    sensors?: Record<string, number>;
  };
}

export interface RoverStatus {
  type: 'status';
  roverId: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  message?: string;
}
