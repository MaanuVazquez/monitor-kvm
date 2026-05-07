// Request bodies
export interface PairBody {
  pairingType?: "PROMPT" | "PIN";
  pin?: string;
}

export interface SetValueBody {
  value: number;
}

export interface SetInputBody {
  input: string;
}

export interface LaunchParamsBody {
  params?: Record<string, unknown>;
}

export interface CallBody {
  uri: string;
  payload?: Record<string, unknown>;
}

// Response shapes
export interface DeviceStatus {
  host: string;
  connected: boolean;
  paired: boolean;
  modelName: string | null;
  sdkVersion: string | null;
  firmwareVersion: string | null;
  uhd?: boolean;
  features?: Record<string, unknown>;
}

export interface DeviceListItem {
  host: string;
  connected: boolean;
  paired: boolean;
  pairedAt: string | null;
}

export interface ApiRootResponse {
  status: "ok";
  deviceCount: number;
  connectedCount: number;
}

export interface ErrorResponse {
  error: string;
}
