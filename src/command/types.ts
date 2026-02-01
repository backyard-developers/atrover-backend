export type CommandAction = 'move' | 'stop' | 'rotate' | 'calibrate';
export type MoveDirection = 'forward' | 'backward' | 'left' | 'right';

export interface MoveCommand {
  type: 'command';
  action: 'move';
  direction: MoveDirection;
  speed?: number;
}

export interface StopCommand {
  type: 'command';
  action: 'stop';
}

export interface RotateCommand {
  type: 'command';
  action: 'rotate';
  degrees: number;
}

export interface CalibrateCommand {
  type: 'command';
  action: 'calibrate';
}

export type RoverCommand = MoveCommand | StopCommand | RotateCommand | CalibrateCommand;

export interface RegisterMessage {
  type: 'register';
  name: string;
}

export interface HeartbeatMessage {
  type: 'heartbeat';
}

export interface CommandMessage {
  type: 'command';
  roverId: string;
  command: RoverCommand;
}

// --- Motor Mapping ---

export interface MotorMapping {
  left: number;  // 1-4
  right: number; // 1-4
}

export const DEFAULT_MOTOR_MAPPING: MotorMapping = { left: 3, right: 4 };

export interface MotorConfigUpdateMessage {
  type: 'motor_config_update';
  roverId: string;
  mapping: MotorMapping;
}

export interface MotorConfigRequestMessage {
  type: 'motor_config_request';
  roverId: string;
}

export interface MotorConfigMessage {
  type: 'motor_config';
  mapping: MotorMapping;
}

export type IncomingMessage = RegisterMessage | HeartbeatMessage | CommandMessage | MotorConfigUpdateMessage | MotorConfigRequestMessage;
