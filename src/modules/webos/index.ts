import WebSocket from "ws";
import { getClientKey, setClientKey, removeClientKey } from "./credentials.ts";
import { parseMessage, registerMessage, requestMessage } from "./protocol.ts";
import { createClient } from "./client.ts";
import type {
  PairOptions,
  ConnectOptions,
  ForgetOptions,
  PinPairingSession,
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

  if (pairingType === "PIN") {
    const session = await beginPinPairing({
      host,
      credentialsPath,
      timeoutMs,
      onPairingPrompt,
    });
    try {
      const code = typeof pin === "function" ? await pin() : pin;
      if (code === undefined) {
        throw new Error(
          'PIN pairing requires the "pin" option (a string or callback returning the code shown on the TV).',
        );
      }
      await session.submitPin(code);
    } catch (err) {
      session.cancel();
      throw err;
    }
    return;
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

    const onOpen = () => {
      if (onPairingPrompt) {
        onPairingPrompt();
      } else {
        console.error(
          `[monitor-kvm] Please click "Allow" on the TV at ${host} to pair.`,
        );
      }
      const msg = registerMessage(undefined, "PROMPT");
      ws.send(JSON.stringify(msg));
    };

    const onMessage = (data: WebSocket.RawData) => {
      const msg = parseMessage(data);
      if (!msg) return;

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

export async function beginPinPairing(
  options: Omit<PairOptions, "pairingType" | "pin">
): Promise<PinPairingSession> {
  const { host, credentialsPath, timeoutMs = 60000, onPairingPrompt } = options;

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
    let promptReady = false;
    let active = true;
    let completing = false;
    let submitReject: ((err: Error) => void) | undefined;
    let submitTimer: ReturnType<typeof setTimeout> | undefined;

    const promptTimer = setTimeout(() => {
      fail(new Error("PIN pairing timed out."));
    }, timeoutMs);

    const cleanup = () => {
      active = false;
      clearTimeout(promptTimer);
      if (submitTimer) clearTimeout(submitTimer);
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

    const fail = (err: Error) => {
      const rejectSubmit = submitReject;
      cleanup();
      if (rejectSubmit) rejectSubmit(err);
      if (!promptReady) reject(err);
    };

    const session: PinPairingSession = {
      host,
      submitPin(pin: string) {
        if (!active) {
          return Promise.reject(new Error("PIN pairing session is closed."));
        }
        if (submitReject) {
          return Promise.reject(new Error("PIN already submitted."));
        }

        return new Promise<void>((resolveSubmit, rejectSubmit) => {
          submitReject = rejectSubmit;
          submitTimer = setTimeout(() => {
            fail(new Error("PIN pairing timed out."));
          }, timeoutMs);

          ws.send(
            JSON.stringify(
              requestMessage("pin_1", "ssap://pairing/setPin", { pin })
            )
          );

          const finish = (err?: Error) => {
            submitReject = undefined;
            if (submitTimer) clearTimeout(submitTimer);
            submitTimer = undefined;
            if (err) {
              cleanup();
              rejectSubmit(err);
              return;
            }
            cleanup();
            resolveSubmit();
          };

          submitReject = (err) => finish(err);
          resolvePin = () => finish();
        });
      },
      cancel() {
        fail(new Error("PIN pairing cancelled."));
      },
    };

    let resolvePin: (() => void) | undefined;

    const onOpen = () => {
      if (onPairingPrompt) {
        onPairingPrompt();
      } else {
        console.error(
          `[monitor-kvm] Check the TV at ${host} for the PIN pairing prompt.`,
        );
      }
      ws.send(JSON.stringify(registerMessage(undefined, "PIN")));
    };

    const onMessage = (data: WebSocket.RawData) => {
      const msg = parseMessage(data);
      if (!msg) return;

      if (
        !promptReady &&
        msg.type === "response" &&
        msg.payload?.pairingType === "PIN"
      ) {
        promptReady = true;
        clearTimeout(promptTimer);
        resolve(session);
        return;
      }

      if (
        (msg.type === "registered" || msg.type === "response") &&
        msg.payload
      ) {
        const key = msg.payload.clientKey ?? msg.payload["client-key"];
        if (key && resolvePin) {
          completing = true;
          ws.removeListener("close", onClose);
          setClientKey(host, String(key), credentialsPath)
            .then(() => resolvePin?.())
            .catch((err) => {
              completing = false;
              fail(err);
            });
          return;
        }
      }

      if (msg.type === "error") {
        fail(new Error(msg.error ?? "PIN pairing failed"));
      }
    };

    const onError = (err: Error) => {
      if (completing) return;
      fail(new Error(`WebSocket error during PIN pairing: ${err.message}`));
    };

    const onClose = () => {
      if (completing) return;
      fail(new Error("WebSocket closed during PIN pairing"));
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
  PinPairingSession,
  WebOSClient,
  SystemInfo,
  KnownInput,
} from "./types.ts";
