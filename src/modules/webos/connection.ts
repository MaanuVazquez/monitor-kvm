import WebSocket from "ws";
import {
  type ProtocolMessage,
  registerMessage,
  requestMessage,
  parseMessage,
} from "./protocol.ts";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class ConnectionManager {
  private ws: WebSocket | null = null;
  private messageId = 1;
  private pending = new Map<string, PendingRequest>();
  private isRegistered = false;
  private reconnectCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isIntentionallyClosed = false;

  constructor(
    private host: string,
    private clientKey: string,
    private reconnectRetries = 3,
    private reconnectDelayMs = 1000,
  ) {}

  get connected(): boolean {
    return (
      this.ws !== null &&
      this.ws.readyState === WebSocket.OPEN &&
      this.isRegistered
    );
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.isIntentionallyClosed = false;
    await this.doConnect();
  }

  private async doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://${this.host}:3001`;
      const ws = new WebSocket(url, {
        tls: { rejectUnauthorized: false },
        // older WebOS TVs may only negotiate legacy TLS
        minVersion: "TLSv1" as any,
        maxVersion: "TLSv1.3" as any,
      } as any);

      const onOpen = () => {
        const reg = registerMessage(this.clientKey);
        ws.send(JSON.stringify(reg));
      };

      const onMessage = (data: WebSocket.RawData) => {
        const msg = parseMessage(data);
        if (!msg) return;

        if (msg.type === "registered") {
          this.isRegistered = true;
          this.reconnectCount = 0;
          ws.removeListener("message", onMessage);
          ws.on("message", (d) => this.handleMessage(d));
          resolve();
          return;
        }

        if (msg.type === "error" && msg.id === "0") {
          reject(new Error(msg.error ?? "Registration failed"));
          return;
        }
      };

      const onError = (err: Error) => {
        reject(new Error(`WebSocket error: ${err.message}`));
      };

      const onClose = () => {
        reject(new Error("WebSocket closed before registration completed"));
      };

      ws.once("open", onOpen);
      ws.once("error", onError);
      ws.once("close", onClose);
      ws.on("message", onMessage);
      ws.on("close", () => this.onUnexpectedClose());
      ws.on("error", () => {}); // swallow late errors to avoid unhandled crashes

      this.ws = ws;
    });
  }

  private handleMessage(data: WebSocket.RawData): void {
    const msg = parseMessage(data);
    if (!msg) return;

    const pending = this.pending.get(msg.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(msg.id);

    if (msg.type === "error") {
      pending.reject(new Error(msg.error ?? "Unknown error"));
    } else {
      pending.resolve(msg.payload ?? {});
    }
  }

  private onUnexpectedClose(): void {
    this.isRegistered = false;
    this.ws = null;

    // Reject all pending requests
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Connection lost"));
    }
    this.pending.clear();

    if (this.isIntentionallyClosed) return;

    if (this.reconnectCount < this.reconnectRetries) {
      this.reconnectCount++;
      this.reconnectTimer = setTimeout(() => {
        this.doConnect().catch(() => {
          this.onUnexpectedClose();
        });
      }, this.reconnectDelayMs);
    }
  }

  async send(uri: string, payload?: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      await this.connect();
    }

    const id = String(this.messageId++);
    const msg = requestMessage(id, uri, payload);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout for ${uri}`));
      }, 30000);

      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify(msg));
    });
  }

  async disconnect(): Promise<void> {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.on("error", () => {});
      this.ws.close();
      this.ws = null;
    }
    this.isRegistered = false;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Disconnected"));
    }
    this.pending.clear();
  }
}
