/// <reference lib="dom" />

export function getApiKey(): string {
  return localStorage.getItem("monitor-kvm-api-key") ?? "";
}

export function setApiKey(key: string): void {
  localStorage.setItem("monitor-kvm-api-key", key);
  window.dispatchEvent(new Event("storage"));
}

export function clearApiKey(): void {
  localStorage.removeItem("monitor-kvm-api-key");
  window.dispatchEvent(new Event("storage"));
}

export async function apiFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      ...init?.headers,
    },
  });

  const data = (await res.json().catch(() => ({ error: "Unknown error" }))) as any;

  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }

  return data;
}
