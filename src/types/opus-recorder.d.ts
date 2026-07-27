// Type shim para `opus-recorder` (v8) — o pacote não traz .d.ts próprio.
// Cobre só o que usamos (gravação OGG/Opus no browser). Ver audio-recorder.tsx.
declare module "opus-recorder" {
  interface OpusRecorderOptions {
    /** URL do worker WASM (servido de /public/opus/encoderWorker.min.js). */
    encoderPath?: string;
    numberOfChannels?: number;
    encoderSampleRate?: number;
    /** 2048 = VOIP (voz), 2049 = Audio. */
    encoderApplication?: number;
    encoderBitRate?: number;
    encoderComplexity?: number;
    streamPages?: boolean;
    recordingGain?: number;
    monitorGain?: number;
    maxFramesPerPage?: number;
    mediaTrackConstraints?: MediaTrackConstraints | boolean;
  }

  export default class Recorder {
    constructor(options?: OpusRecorderOptions);
    static isRecordingSupported(): boolean;
    state: string;
    ondataavailable: (typedArray: Uint8Array) => void;
    onstart: () => void;
    onstop: () => void;
    onpause: () => void;
    onresume: () => void;
    start(): Promise<void>;
    stop(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    close(): void;
  }
}
