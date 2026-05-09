import { connect, pair, forgetCredentials, beginPinPairing } from "../webos/index.ts";
import type { WebOSClient, PairOptions, PinPairingSession } from "../webos/types.ts";
import { getAllHosts } from "../webos/credentials.ts";
import type { HostCredential } from "../webos/credentials.ts";
import type { DeviceStatus, DeviceListItem } from "./types.ts";

interface PoolEntry {
  client: WebOSClient;
  host: string;
  pairedAt: string;
}

interface PendingPinPairing {
  generation: number;
  session?: PinPairingSession;
  submitting?: boolean;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

interface DevicePoolDeps {
  connect: typeof connect;
  pair: typeof pair;
  forgetCredentials: typeof forgetCredentials;
  beginPinPairing: typeof beginPinPairing;
  getAllHosts: typeof getAllHosts;
}

const defaultDeps: DevicePoolDeps = {
  connect,
  pair,
  forgetCredentials,
  beginPinPairing,
  getAllHosts,
};

const PIN_PAIRING_CLEANUP_MS = 60000;

export class DevicePool {
  private clients = new Map<string, PoolEntry>();
  private connecting = new Map<string, Promise<WebOSClient>>();
  private pendingPinPairings = new Map<string, PendingPinPairing>();
  private pinPairingGeneration = 0;
  private credentialsPath: string | undefined;
  private deps: DevicePoolDeps;

  constructor(credentialsPath?: string, deps: DevicePoolDeps = defaultDeps) {
    this.credentialsPath = credentialsPath;
    this.deps = deps;
  }

  async getClient(host: string): Promise<WebOSClient> {
    const entry = this.clients.get(host);

    if (entry && entry.client.connected) {
      return entry.client;
    }

    const existing = this.connecting.get(host);
    if (existing) return existing;

    const promise = this.doConnect(host, entry).finally(() => {
      this.connecting.delete(host);
    });
    this.connecting.set(host, promise);
    return promise;
  }

  private async doConnect(host: string, entry: PoolEntry | undefined): Promise<WebOSClient> {
    if (entry && !entry.client.connected) {
      const fresh = await this.deps.connect({
        host,
        credentialsPath: this.credentialsPath,
      });
      this.clients.set(host, { ...entry, client: fresh });
      return fresh;
    }

    const fresh = await this.deps.connect({
      host,
      credentialsPath: this.credentialsPath,
    });
    this.clients.set(host, {
      client: fresh,
      host,
      pairedAt: new Date().toISOString(),
    });
    return fresh;
  }

  async pairDevice(host: string, opts: Omit<PairOptions, 'host'>): Promise<void> {
    await this.deps.pair({
      host,
      credentialsPath: this.credentialsPath,
      ...opts,
    });

    const client = await this.deps.connect({
      host,
      credentialsPath: this.credentialsPath,
    });
    const existing = this.clients.get(host);
    if (existing) {
      try {
        await existing.client.disconnect();
      } catch {
        // ignore disconnect errors while replacing a client
      }
    }
    this.clients.set(host, {
      client,
      host,
      pairedAt: new Date().toISOString(),
    });
  }

  async startPinPairing(host: string): Promise<void> {
    const existing = this.pendingPinPairings.get(host);
    if (existing?.session) {
      this.clearPinPairingCleanup(existing);
      existing.session.cancel();
    }

    const pending: PendingPinPairing = { generation: ++this.pinPairingGeneration };
    this.pendingPinPairings.set(host, pending);

    try {
      const session = await this.deps.beginPinPairing({
        host,
        credentialsPath: this.credentialsPath,
        timeoutMs: 60000,
      });

      if (this.pendingPinPairings.get(host) !== pending) {
        session.cancel();
        return;
      }

      pending.session = session;
      pending.cleanupTimer = setTimeout(() => {
        if (this.isCurrentPinPairing(host, pending, session)) {
          session.cancel();
          this.pendingPinPairings.delete(host);
        }
      }, PIN_PAIRING_CLEANUP_MS);
    } catch (err) {
      if (this.pendingPinPairings.get(host) === pending) {
        this.clearPinPairingCleanup(pending);
        this.pendingPinPairings.delete(host);
      }
      throw err;
    }
  }

  async submitPinPairing(host: string, pin: string): Promise<void> {
    const pending = this.pendingPinPairings.get(host);
    const session = pending?.session;
    if (!session) {
      throw new Error("No pending PIN pairing session. Start PIN pairing again.");
    }
    if (pending.submitting) {
      throw new Error("PIN pairing submission already in progress.");
    }

    this.clearPinPairingCleanup(pending);
    pending.submitting = true;
    try {
      await session.submitPin(pin);
      if (!this.isCurrentPinPairing(host, pending, session)) {
        throw new Error("No pending PIN pairing session. Start PIN pairing again.");
      }

      const client = await this.deps.connect({
        host,
        credentialsPath: this.credentialsPath,
      });
      if (!this.isCurrentPinPairing(host, pending, session)) {
        await client.disconnect().catch(() => {});
        throw new Error("No pending PIN pairing session. Start PIN pairing again.");
      }

      const existing = this.clients.get(host);
      if (existing) {
        try {
          await existing.client.disconnect();
        } catch {
          // ignore disconnect errors while replacing a client
        }
      }
      if (!this.isCurrentPinPairing(host, pending, session)) {
        await client.disconnect().catch(() => {});
        throw new Error("No pending PIN pairing session. Start PIN pairing again.");
      }

      this.clients.set(host, {
        client,
        host,
        pairedAt: new Date().toISOString(),
      });
    } finally {
      if (this.isCurrentPinPairing(host, pending, session)) {
        this.clearPinPairingCleanup(pending);
        this.pendingPinPairings.delete(host);
      }
    }
  }

  cancelPinPairing(host: string): void {
    this.clearPendingPinPairing(host);
  }

  private clearPinPairingCleanup(pending: PendingPinPairing): void {
    if (pending.cleanupTimer) {
      clearTimeout(pending.cleanupTimer);
      pending.cleanupTimer = undefined;
    }
  }

  private isCurrentPinPairing(
    host: string,
    pending: PendingPinPairing,
    session: PinPairingSession,
  ): boolean {
    const current = this.pendingPinPairings.get(host);
    return current === pending && current.session === session;
  }

  private clearPendingPinPairing(host: string): void {
    const pending = this.pendingPinPairings.get(host);
    if (!pending) return;

    this.clearPinPairingCleanup(pending);
    pending.session?.cancel();
    this.pendingPinPairings.delete(host);
  }

  async removeDevice(host: string): Promise<void> {
    this.clearPendingPinPairing(host);

    const entry = this.clients.get(host);
    if (entry) {
      try {
        await entry.client.disconnect();
      } catch {
        // ignore disconnect errors during removal
      }
      this.clients.delete(host);
    }
    await this.deps.forgetCredentials({
      host,
      credentialsPath: this.credentialsPath,
    });
  }

  async forceReconnect(host: string): Promise<void> {
    const entry = this.clients.get(host);
    if (entry) {
      try {
        await entry.client.disconnect();
      } catch {
        // ignore
      }
      this.clients.delete(host);
    }

    const client = await this.deps.connect({
      host,
      credentialsPath: this.credentialsPath,
    });
    this.clients.set(host, {
      client,
      host,
      pairedAt: entry?.pairedAt ?? new Date().toISOString(),
    });
  }

  async getAllDevices(): Promise<DeviceListItem[]> {
    const hosts = await this.deps.getAllHosts(this.credentialsPath);

    return hosts.map((host: string) => {
      const entry = this.clients.get(host);
      return {
        host,
        connected: entry?.client.connected ?? false,
        paired: true,
        pairedAt: entry?.pairedAt ?? null,
      };
    });
  }

  async getDeviceStatus(host: string): Promise<DeviceStatus> {
    let connected = false;
    let modelName: string | null = null;
    let sdkVersion: string | null = null;
    let firmwareVersion: string | null = null;
    let uhd: boolean | undefined;
    let features: Record<string, unknown> | undefined;

    try {
      const client = await this.getClient(host);
      connected = client.connected;
      try {
        const info = await client.getSystemInfo();
        modelName = info.modelName;
        sdkVersion = info.sdkVersion;
        firmwareVersion = info.firmwareVersion;
        uhd = info.uhd;
        features = info.features;
      } catch {
        // system info failed, still return what we know
      }
    } catch {
      // device not paired or connection failed
    }

    return {
      host,
      connected,
      paired: this.clients.has(host),
      modelName,
      sdkVersion,
      firmwareVersion,
      uhd,
      features,
    };
  }
}

export const devicePool = new DevicePool();
