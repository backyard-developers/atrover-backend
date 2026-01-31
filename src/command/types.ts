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

export type IncomingMessage = RegisterMessage | HeartbeatMessage | CommandMessage;
