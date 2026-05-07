import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_FILE = ".monitor-kvm/credentials.json";
const ENV_VAR = "MONITOR_KVM_CREDENTIALS";

interface HostCredential {
  clientKey: string;
  pairedAt: string;
}

interface CredentialsFile {
  version: number;
  hosts: Record<string, HostCredential>;
}

function getPath(userPath?: string): string {
  if (userPath) return resolve(userPath);
  if (process.env[ENV_VAR]) return resolve(process.env[ENV_VAR]);
  return resolve(DEFAULT_FILE);
}

async function load(path: string): Promise<CredentialsFile> {
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as CredentialsFile;
    if (!parsed.hosts) parsed.hosts = {};
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, hosts: {} };
    }
    throw err;
  }
}

async function save(path: string, data: CredentialsFile): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
}

export async function getClientKey(
  host: string,
  credentialsPath?: string
): Promise<string | undefined> {
  const path = getPath(credentialsPath);
  const data = await load(path);
  return data.hosts[host]?.clientKey;
}

export async function setClientKey(
  host: string,
  clientKey: string,
  credentialsPath?: string
): Promise<void> {
  const path = getPath(credentialsPath);
  const data = await load(path);
  data.hosts[host] = {
    clientKey,
    pairedAt: new Date().toISOString(),
  };
  await save(path, data);
}

export async function removeClientKey(
  host: string,
  credentialsPath?: string
): Promise<void> {
  const path = getPath(credentialsPath);
  const data = await load(path);
  delete data.hosts[host];
  await save(path, data);
}
