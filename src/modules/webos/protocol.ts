export interface ProtocolMessage {
  id: string;
  type: string;
  uri?: string;
  payload?: Record<string, unknown>;
  error?: string;
}

export const DEFAULT_PERMISSIONS = [
  "LAUNCH",
  "LAUNCH_WEBAPP",
  "APP_TO_APP",
  "CONTROL_AUDIO",
  "CONTROL_DISPLAY",
  "CONTROL_POWER",
  "CONTROL_INPUT_MEDIA_PLAYBACK",
  "CONTROL_INPUT_TV",
  "CONTROL_INPUT_TEXT",
  "CONTROL_MOUSE_AND_KEYBOARD",
  "READ_APP_STATUS",
  "READ_INSTALLED_APPS",
  "READ_RUNNING_APPS",
  "READ_POWER_STATE",
  "READ_NETWORK_STATE",
  "READ_INPUT_DEVICE_LIST",
  "READ_CURRENT_CHANNEL",
  "READ_TV_CURRENT_INPUT",
  "READ_TV_CHANNEL_LIST",
  "READ_TV_PROGRAM_INFO",
  "READ_UPDATE_INFO",
  "READ_NOTIFICATIONS",
  "WRITE_SETTINGS",
  "WRITE_NOTIFICATION_TOAST",
];

export function registerMessage(
  clientKey?: string,
  pairingType?: "PROMPT" | "PIN"
): ProtocolMessage {
  const payload: Record<string, unknown> = {
    manifest: {
      manifestVersion: 1,
      permissions: DEFAULT_PERMISSIONS,
    },
  };
  if (clientKey) {
    // reconnect: send key to skip the pairing prompt
    payload["client-key"] = clientKey;
  } else {
    // first-time pairing: tell TV which pairing flow to use
    payload.forcePairing = false;
    payload.pairingType = pairingType ?? "PROMPT";
  }
  return {
    id: "0",
    type: "register",
    payload,
  };
}

export function requestMessage(
  id: string,
  uri: string,
  payload?: Record<string, unknown>
): ProtocolMessage {
  return {
    id,
    type: "request",
    uri,
    payload,
  };
}

export function isResponse(msg: ProtocolMessage, expectedId: string): boolean {
  return msg.id === expectedId && (msg.type === "response" || msg.type === "error");
}

export function parseMessage(
  data: string | Buffer | ArrayBuffer | Buffer[]
): ProtocolMessage | null {
  try {
    let text: string;
    if (typeof data === "string") {
      text = data;
    } else if (Array.isArray(data)) {
      text = Buffer.concat(data).toString("utf-8");
    } else if (data instanceof Buffer) {
      text = data.toString("utf-8");
    } else {
      text = new TextDecoder().decode(data);
    }
    const parsed = JSON.parse(text) as ProtocolMessage;
    if (parsed && (typeof parsed.id === "string" || typeof parsed.id === "number") && typeof parsed.type === "string") {
      parsed.id = String(parsed.id);
      return parsed;
    }
  } catch {
    // ignore malformed messages
  }
  return null;
}
