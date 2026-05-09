export interface PairOptions {
  host: string;
  credentialsPath?: string;
  timeoutMs?: number;
  onPairingPrompt?: () => void;
  pairingType?: "PROMPT" | "PIN";
  pin?: string | (() => string | Promise<string>);
}

export interface PinPairingSession {
  host: string;
  submitPin(pin: string): Promise<void>;
  cancel(): void;
}

export interface ConnectOptions {
  host: string;
  credentialsPath?: string;
  reconnectRetries?: number;
  reconnectDelayMs?: number;
}

export interface ForgetOptions {
  host: string;
  credentialsPath?: string;
}

export interface SystemInfo {
  modelName: string;
  sdkVersion: string;
  firmwareVersion: string;
  uhd?: boolean;
  features?: Record<string, unknown>;
}

export type RemoteButton =
  | "UP"
  | "DOWN"
  | "LEFT"
  | "RIGHT"
  | "ENTER"
  | "BACK"
  | "MENU"
  | "EXIT";

export interface WebOSClient {
  connected: boolean;

  call(uri: string, payload?: Record<string, unknown>): Promise<unknown>;

  setInput(input: string): Promise<void>;
  getInput(): Promise<string>;

  setBrightness(value: number): Promise<void>;
  getBrightness(): Promise<number>;

  setVolume(value: number): Promise<void>;
  getVolume(): Promise<number>;

  mute(): Promise<void>;
  unmute(): Promise<void>;
  getMute(): Promise<boolean>;

  powerOff(): Promise<void>;
  turnOffScreen(): Promise<void>;
  turnOnScreen(): Promise<void>;

  getSystemInfo(): Promise<SystemInfo>;
  getServiceList(): Promise<string[]>;

  launchApp(appId: string, params?: Record<string, unknown>): Promise<void>;

  sendRemoteButton(button: RemoteButton): Promise<void>;

  disconnect(): Promise<void>;
}

export type KnownInput =
  | "HDMI_1"
  | "HDMI_2"
  | "HDMI_3"
  | "HDMI_4"
  | "COMPOSITE"
  | "COMPONENT"
  | "LIVE_TV"
  | "RGB"
  | "MIRACAST"
  | "IMGVIEWER"
  | "USB"
  | "DVR"
  | "MEDIA";
