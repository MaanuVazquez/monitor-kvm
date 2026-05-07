import { connect, pair, forgetCredentials } from "../webos/index.ts";
import type { WebOSClient, PairOptions } from "../webos/types.ts";
import { getAllHosts } from "../webos/credentials.ts";
import type { HostCredential } from "../webos/credentials.ts";
import type { DeviceStatus, DeviceListItem } from "./types.ts";

interface PoolEntry {
  client: WebOSClient;
  host: string;
  pairedAt: string;
}

class DevicePool {
  private clients = new Map<string, PoolEntry>();
  private credentialsPath: string | undefined;

  constructor(credentialsPath?: string) {
    this.credentialsPath = credentialsPath;
  }

  async getClient(host: string): Promise<WebOSClient> {
    const entry = this.clients.get(host);

    if (entry && entry.client.connected) {
      return entry.client;
    }

    if (entry && !entry.client.connected) {
      try {
        const fresh = await connect({
          host,
          credentialsPath: this.credentialsPath,
        });
        this.clients.set(host, { ...entry, client: fresh });
        return fresh;
      } catch {
        throw new Error("Device not connected");
      }
    }

    const fresh = await connect({
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

  async pairDevice(host: string, opts: PairOptions): Promise<void> {
    await pair({
      host,
      credentialsPath: this.credentialsPath,
      pairingType: opts.pairingType,
      pin: opts.pin,
      onPairingPrompt: opts.onPairingPrompt,
      timeoutMs: opts.timeoutMs,
    });

    const client = await connect({
      host,
      credentialsPath: this.credentialsPath,
    });
    this.clients.set(host, {
      client,
      host,
      pairedAt: new Date().toISOString(),
    });
  }

  async removeDevice(host: string): Promise<void> {
    const entry = this.clients.get(host);
    if (entry) {
      try {
        await entry.client.disconnect();
      } catch {
        // ignore disconnect errors during removal
      }
      this.clients.delete(host);
    }
    await forgetCredentials({
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

    const client = await connect({
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
    const hosts = await getAllHosts(this.credentialsPath);

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
