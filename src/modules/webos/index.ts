import WebSocket from "ws";
import { getClientKey, setClientKey, removeClientKey } from "./credentials.ts";
import { parseMessage, registerMessage } from "./protocol.ts";
import { createClient } from "./client.ts";
import type {
  PairOptions,
  ConnectOptions,
  ForgetOptions,
  WebOSClient,
} from "./types.ts";

export async function pair(options: PairOptions): Promise<void> {
  const {
    host,
    credentialsPath,
    timeoutMs = 60000,
    onPairingPrompt,
    pairingType = "PROMPT",
    pin,
  } = options;

  if (pairingType === "PIN" && pin === undefined) {
    throw new Error(
      'PIN pairing requires the "pin" option (a string or callback returning the code shown on the TV).',
    );
  }

  const existing = await getClientKey(host, credentialsPath);
  if (existing) {
    throw new Error(
      `Already paired with ${host}. Use forgetCredentials() first to re-pair.`,
    );
  }

  const url = `wss://${host}:3001`;
  const ws = new WebSocket(url, {
    tls: { rejectUnauthorized: false },
    minVersion: "TLSv1" as any,
    maxVersion: "TLSv1.3" as any,
  } as any);

  return new Promise((resolve, reject) => {
    let pinSent = false;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Pairing timed out. Did you click Allow on the TV?"));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      ws.removeListener("open", onOpen);
      ws.removeListener("message", onMessage);
      ws.removeListener("error", onError);
      ws.removeListener("close", onClose);
      ws.on("error", () => {});
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };

    const sendPin = async () => {
      if (pinSent) return;
      pinSent = true;
      const code = typeof pin === "function" ? await pin() : pin;
      const pinReq = {
        type: "request",
        id: "pin_1",
        uri: "ssap://pairing/setPin",
        payload: { pin: code },
      };
      ws.send(JSON.stringify(pinReq));
    };

    const onOpen = () => {
      if (onPairingPrompt) {
        onPairingPrompt();
      } else if (pairingType === "PIN") {
        console.error(
          `[monitor-kvm] Pairing with PIN "${pin}". ` +
          `Check the TV screen for the code to confirm it matches.`,
        );
      } else {
        console.error(
          `[monitor-kvm] Please click "Allow" on the TV at ${host} to pair.`,
        );
      }
      const msg = registerMessage(undefined, pairingType);
      ws.send(JSON.stringify(msg));
    };

    const onMessage = (data: WebSocket.RawData) => {
      const msg = parseMessage(data);
      if (!msg) return;

      // PIN mode: TV sent the pairing prompt, now send the PIN
      if (
        pairingType === "PIN" &&
        msg.type === "response" &&
        msg.payload?.pairingType === "PIN"
      ) {
        sendPin().catch(reject);
        return;
      }

      // Got the client key
      if (
        (msg.type === "registered" || msg.type === "response") &&
        msg.payload
      ) {
        const key =
          msg.payload.clientKey ?? msg.payload["client-key"];
        if (key) {
          setClientKey(host, String(key), credentialsPath)
            .then(() => {
              cleanup();
              resolve();
            })
            .catch((err) => {
              cleanup();
              reject(err);
            });
          return;
        }
      }

      if (msg.type === "error" && msg.id === "0") {
        cleanup();
        reject(new Error(msg.error ?? "Pairing failed"));
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(new Error(`WebSocket error during pairing: ${err.message}`));
    };

    const onClose = () => {
      cleanup();
      reject(new Error("WebSocket closed during pairing"));
    };

    ws.on("open", onOpen);
    ws.on("message", onMessage);
    ws.on("error", onError);
    ws.on("close", onClose);
  });
}

export async function connect(options: ConnectOptions): Promise<WebOSClient> {
  const { host, credentialsPath, reconnectRetries, reconnectDelayMs } = options;

  const clientKey = await getClientKey(host, credentialsPath);
  if (!clientKey) {
    throw new Error(`No credentials found for ${host}. Call pair() first.`);
  }

  const client = createClient(host, clientKey);
  // Force connection to validate key and fetch system info
  await client.getSystemInfo().catch((err) => {
    client.disconnect().catch(() => {});
    throw new Error(`Failed to connect to ${host}: ${err.message}`);
  });

  return client;
}

export async function forgetCredentials(options: ForgetOptions): Promise<void> {
  const { host, credentialsPath } = options;
  await removeClientKey(host, credentialsPath);
}

export type {
  PairOptions,
  ConnectOptions,
  ForgetOptions,
  WebOSClient,
  SystemInfo,
  KnownInput,
} from "./types.ts";
