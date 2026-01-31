export const MediaType = {
  VIDEO: 0x01,
  AUDIO: 0x02,
} as const;

export type MediaTypeValue = (typeof MediaType)[keyof typeof MediaType];

export interface MediaFrame {
  type: MediaTypeValue;
  roverId: string;
  timestamp: number;
  data: Buffer;
}

export interface MediaStreamInfo {
  roverId: string;
  type: 'video' | 'audio';
  codec?: string;
  width?: number;
  height?: number;
  sampleRate?: number;
}

export interface StartStreamMessage {
  type: 'start_stream';
  roverId: string;
  mediaType: 'video' | 'audio' | 'both';
}

export interface StopStreamMessage {
  type: 'stop_stream';
  roverId: string;
}

export interface MediaRegisterMessage {
  type: 'register';
  roverId: string;
}

export type MediaControlMessage = StartStreamMessage | StopStreamMessage | MediaRegisterMessage;
