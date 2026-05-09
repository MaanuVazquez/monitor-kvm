# WebOS REST API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose all WebOS client methods as protected REST API endpoints under `/api/devices/:host/...`

**Architecture:** A `DevicePool` singleton (lazy-connect, auto-reconnect on action, 3-retry then dead) wraps the existing WebOS library. Per-resource route files under `routes/api/` call the pool. CORS added for browser access. SSR dashboard shows device list.

**Tech Stack:** Hono, React SSR (`@hono/react-renderer`), existing `src/modules/webos/` library. Tests mock the DevicePool.

**Decisions (from grilling):**
- Connection: lazy connect on first call, auto-reconnect 3x, then dead
- Reconnect behavior: pool.getClient() auto-reconnects if disconnected; pair/forget/reconnect endpoints bypass this
- Response shape: wrapped `{ "brightness": 50 }`, `{ "value": 50 }` for setters
- Errors: `{ "error": "string" }` + HTTP status
- CORS: env-configurable origins
- Range validation: brightness and volume 0-100
- Unpaired hosts: 404
- Pairing: single blocking POST with `{ pairingType, pin? }`
- Generic call: unrestricted

---

### Task 1: Add `connected` property to WebOSClient interface

**Files:**
- Modify: `src/modules/webos/types.ts:30-55`
- Modify: `src/modules/webos/client.ts:40-206`

- [ ] **Step 1: Add `connected` to the interface**

In `src/modules/webos/types.ts:30-55`, add `connected: boolean;` to the `WebOSClient` interface:

```typescript
export interface WebOSClient {
  connected: boolean;

  call(uri: string, payload?: Record<string, unknown>): Promise<unknown>;
  // ... rest unchanged
}
```

- [ ] **Step 2: Expose `connected` on the client**

In `src/modules/webos/client.ts:40`, add `connected` property to the client object. The `ConnectionManager` already has a `connected` getter (`connection.ts:31-37`):

```typescript
export function createClient(
  host: string,
  clientKey: string
): WebOSClient {
  const conn = new ConnectionManager(host, clientKey);
  let cachedModelName: string | undefined;

  const client: WebOSClient = {
    get connected() {
      return conn.connected;
    },

    async call(uri, payload) {
      // ... unchanged
```

- [ ] **Step 3: Run type-check**

Run: `bunx tsc --noEmit`
Expected: PASS (no type errors)

- [ ] **Step 4: Run existing tests**

Run: `bun test`
Expected: All existing tests pass

- [ ] **Step 5: Commit**

```bash
git add src/modules/webos/types.ts src/modules/webos/client.ts
git commit -m "feat: expose connected property on WebOSClient"
```

---

### Task 2: Create API type definitions

**Files:**
- Create: `src/modules/http/types.ts`

- [ ] **Step 1: Write types file**

```typescript
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
```

- [ ] **Step 2: Run type-check**

Run: `bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/types.ts
git commit -m "feat: add API type definitions"
```

---

### Task 3: Create CORS middleware

**Files:**
- Create: `src/modules/http/middlewares/cors.ts`

- [ ] **Step 1: Write CORS middleware**

```typescript
import { createMiddleware } from "hono/factory";

export const corsMiddleware = createMiddleware(async (c, next) => {
  const origin = process.env.ALLOWED_ORIGINS ?? "*";
  const origins = origin.split(",").map((s) => s.trim());

  await next();

  const requestOrigin = c.req.header("origin");
  if (requestOrigin && (origins.includes("*") || origins.includes(requestOrigin))) {
    c.res.headers.set("Access-Control-Allow-Origin", requestOrigin);
  } else if (origins.includes("*")) {
    c.res.headers.set("Access-Control-Allow-Origin", "*");
  }

  c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  c.res.headers.set("Access-Control-Max-Age", "86400");
});

export function corsPreflight() {
  return createMiddleware(async (c, next) => {
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }
    await next();
  });
}
```

- [ ] **Step 2: Run type-check**

Run: `bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/middlewares/cors.ts
git commit -m "feat: add CORS middleware"
```

---

### Task 4: Create DevicePool module

**Files:**
- Create: `src/modules/http/device-pool.ts`

- [ ] **Step 1: Write DevicePool**

```typescript
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
```

- [ ] **Step 2: Add `getAllHosts` to credentials module and export `HostCredential`**

In `src/modules/webos/credentials.ts`:

Change line 7 from `interface HostCredential {` to `export interface HostCredential {`.

Add at end of file:

```typescript
export async function getAllHosts(credentialsPath?: string): Promise<string[]> {
  const path = getPath(credentialsPath);
  const data = await load(path);
  return Object.keys(data.hosts);
}
```

- [ ] **Step 3: Run type-check**

Run: `bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/modules/http/device-pool.ts src/modules/webos/credentials.ts
git commit -m "feat: add DevicePool for connection lifecycle management"
```

---

### Task 5: Remove old api.ts, create routes/api/ directory structure

**Files:**
- Delete: `src/modules/http/routes/api.ts`
- Create: `src/modules/http/routes/api/index.ts`

- [ ] **Step 1: Delete old api.ts and create directory**

```bash
Remove-Item -LiteralPath "src/modules/http/routes/api.ts"
New-Item -ItemType Directory -Force -Path "src/modules/http/routes/api"
```

- [ ] **Step 2: Write routes/api/index.ts (route composer)**

```typescript
import { Hono } from "hono";
import { apiKeyMiddleware } from "../../middlewares/api-key.ts";
import { corsMiddleware, corsPreflight } from "../../middlewares/cors.ts";
import deviceRoutes from "./device.ts";
import inputRoutes from "./input.ts";
import displayRoutes from "./display.ts";
import audioRoutes from "./audio.ts";
import appRoutes from "./app.ts";
import callRoutes from "./call.ts";
import rootRoutes from "./root.ts";

const api = new Hono();

api.use("*", corsPreflight());
api.use("*", corsMiddleware);
api.use("*", apiKeyMiddleware);

api.route("/", rootRoutes);
api.route("/devices", deviceRoutes);
api.route("/devices", inputRoutes);
api.route("/devices", displayRoutes);
api.route("/devices", audioRoutes);
api.route("/devices", appRoutes);
api.route("/devices", callRoutes);

export default api;
```

- [ ] **Step 3: Run type-check (will fail until route files exist)**

Run: `bunx tsc --noEmit`
Expected: FAIL (route files not created yet — this is expected; proceed to Task 6)

- [ ] **Step 4: Commit**

```bash
git add src/modules/http/routes/api/index.ts
git commit -m "feat: scaffold API route directory structure"
```

---

### Task 6: Create root route (`GET /api`)

**Files:**
- Create: `src/modules/http/routes/api/root.ts`

- [ ] **Step 1: Write root route**

```typescript
import { Hono } from "hono";
import { devicePool } from "../../device-pool.ts";
import type { ApiRootResponse } from "../../types.ts";

const root = new Hono();

root.get("/", async (c) => {
  const devices = await devicePool.getAllDevices();
  const connectedCount = devices.filter((d) => d.connected).length;

  return c.json({
    status: "ok",
    deviceCount: devices.length,
    connectedCount,
  } satisfies ApiRootResponse);
});

export default root;
```

- [ ] **Step 2: Run type-check**

Run: `bunx tsc --noEmit`
Expected: FAIL (other route files still missing — expected)

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/routes/api/root.ts
git commit -m "feat: add GET /api summary endpoint"
```

---

### Task 7: Create device routes (pair, forget, reconnect, status, list)

**Files:**
- Create: `src/modules/http/routes/api/device.ts`

- [ ] **Step 1: Write device routes**

```typescript
import { Hono } from "hono";
import { devicePool } from "../../device-pool.ts";
import type { PairBody, DeviceStatus, DeviceListItem } from "../../types.ts";

const device = new Hono();

device.post("/:host/pair", async (c) => {
  const host = c.req.param("host");
  const body = (await c.req.json().catch(() => ({}))) as PairBody;

  try {
    await devicePool.pairDevice(host, {
      pairingType: body.pairingType,
      pin: body.pin,
      onPairingPrompt: undefined,
      timeoutMs: 60000,
    });
    return c.json({ paired: true, host });
  } catch (err: any) {
    return c.json({ error: err.message ?? "Pairing failed" }, 500);
  }
});

device.delete("/:host/pair", async (c) => {
  const host = c.req.param("host");

  try {
    await devicePool.removeDevice(host);
    return c.json({ host, unpaired: true });
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to unpair" }, 500);
  }
});

device.post("/:host/reconnect", async (c) => {
  const host = c.req.param("host");

  try {
    await devicePool.forceReconnect(host);
    return c.json({ host, reconnected: true });
  } catch (err: any) {
    return c.json({ error: err.message ?? "Reconnect failed" }, 500);
  }
});

device.get("/:host/status", async (c) => {
  const host = c.req.param("host");

  const status: DeviceStatus = await devicePool.getDeviceStatus(host);

  if (!status.paired) {
    return c.json({ error: "Device not paired" }, 404);
  }

  return c.json(status);
});

device.get("/", async (c) => {
  const devices: DeviceListItem[] = await devicePool.getAllDevices();
  return c.json(devices);
});

export default device;
```

- [ ] **Step 2: Run type-check**

Run: `bunx tsc --noEmit`
Expected: FAIL (other route files still missing — expected)

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/routes/api/device.ts
git commit -m "feat: add device management API routes"
```

---

### Task 8: Create input routes (get/set input)

**Files:**
- Create: `src/modules/http/routes/api/input.ts`

- [ ] **Step 1: Write input routes**

```typescript
import { Hono } from "hono";
import { devicePool } from "../../device-pool.ts";
import type { SetInputBody } from "../../types.ts";

const input = new Hono();

input.get("/:host/input", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    const inputValue = await client.getInput();
    return c.json({ input: inputValue });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to get input" }, 500);
  }
});

input.post("/:host/input", async (c) => {
  const host = c.req.param("host");
  const body = (await c.req.json()) as SetInputBody;

  if (!body.input) {
    return c.json({ error: "input is required" }, 400);
  }

  try {
    const client = await devicePool.getClient(host);
    await client.setInput(body.input);
    return c.json({ input: body.input });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to set input" }, 500);
  }
});

export default input;
```

- [ ] **Step 2: Run type-check**

Run: `bunx tsc --noEmit`
Expected: FAIL (other route files still missing — expected)

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/routes/api/input.ts
git commit -m "feat: add input get/set API routes"
```

---

### Task 9: Create display routes (brightness, screen on/off)

**Files:**
- Create: `src/modules/http/routes/api/display.ts`

- [ ] **Step 1: Write display routes**

```typescript
import { Hono } from "hono";
import { devicePool } from "../../device-pool.ts";
import type { SetValueBody } from "../../types.ts";

const display = new Hono();

display.get("/:host/brightness", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    const brightness = await client.getBrightness();
    return c.json({ brightness });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to get brightness" }, 500);
  }
});

display.post("/:host/brightness", async (c) => {
  const host = c.req.param("host");
  const body = (await c.req.json()) as SetValueBody;

  if (typeof body.value !== "number" || body.value < 0 || body.value > 100) {
    return c.json({ error: "value must be a number between 0 and 100" }, 400);
  }

  try {
    const client = await devicePool.getClient(host);
    await client.setBrightness(body.value);
    return c.json({ brightness: body.value });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to set brightness" }, 500);
  }
});

display.post("/:host/power/screen/off", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    await client.turnOffScreen();
    return c.json({ screen: "off" });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to turn off screen" }, 500);
  }
});

display.post("/:host/power/screen/on", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    await client.turnOnScreen();
    return c.json({ screen: "on" });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to turn on screen" }, 500);
  }
});

display.post("/:host/power/off", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    await client.powerOff();
    return c.json({ power: "off" });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to power off" }, 500);
  }
});

export default display;
```

- [ ] **Step 2: Run type-check**

Run: `bunx tsc --noEmit`
Expected: FAIL (other route files still missing — expected)

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/routes/api/display.ts
git commit -m "feat: add display/brightness/power API routes"
```

---

### Task 10: Create audio routes (volume, mute/unmute)

**Files:**
- Create: `src/modules/http/routes/api/audio.ts`

- [ ] **Step 1: Write audio routes**

```typescript
import { Hono } from "hono";
import { devicePool } from "../../device-pool.ts";
import type { SetValueBody } from "../../types.ts";

const audio = new Hono();

audio.get("/:host/volume", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    const volume = await client.getVolume();
    let muted = false;
    try {
      const result = (await client.call("ssap://audio/getMute")) as { mute?: boolean };
      muted = result.mute ?? false;
    } catch {
      // ignore; mute state is best-effort
    }
    return c.json({ volume, muted });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to get volume" }, 500);
  }
});

audio.post("/:host/volume", async (c) => {
  const host = c.req.param("host");
  const body = (await c.req.json()) as SetValueBody;

  if (typeof body.value !== "number" || body.value < 0 || body.value > 100) {
    return c.json({ error: "value must be a number between 0 and 100" }, 400);
  }

  try {
    const client = await devicePool.getClient(host);
    await client.setVolume(body.value);
    return c.json({ volume: body.value });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to set volume" }, 500);
  }
});

audio.post("/:host/volume/mute", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    await client.mute();
    return c.json({ muted: true });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to mute" }, 500);
  }
});

audio.delete("/:host/volume/mute", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    await client.unmute();
    return c.json({ muted: false });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to unmute" }, 500);
  }
});

export default audio;
```

- [ ] **Step 2: Run type-check**

Run: `bunx tsc --noEmit`
Expected: FAIL (other route files still missing — expected)

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/routes/api/audio.ts
git commit -m "feat: add volume/mute API routes"
```

---

### Task 11: Create app route (launch app)

**Files:**
- Create: `src/modules/http/routes/api/app.ts`

- [ ] **Step 1: Write app route**

```typescript
import { Hono } from "hono";
import { devicePool } from "../../device-pool.ts";
import type { LaunchParamsBody } from "../../types.ts";

const app = new Hono();

app.post("/:host/app/:appId", async (c) => {
  const host = c.req.param("host");
  const appId = c.req.param("appId");
  const body = (await c.req.json().catch(() => ({}))) as LaunchParamsBody;

  try {
    const client = await devicePool.getClient(host);
    await client.launchApp(appId, body.params);
    return c.json({ appId, launched: true });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to launch app" }, 500);
  }
});

export default app;
```

- [ ] **Step 2: Run type-check**

Run: `bunx tsc --noEmit`
Expected: FAIL (call route still missing — expected)

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/routes/api/app.ts
git commit -m "feat: add app launch API route"
```

---

### Task 12: Create call route (generic SSAP)

**Files:**
- Create: `src/modules/http/routes/api/call.ts`

- [ ] **Step 1: Write call route**

```typescript
import { Hono } from "hono";
import { devicePool } from "../../device-pool.ts";
import type { CallBody } from "../../types.ts";

const call = new Hono();

call.post("/:host/call", async (c) => {
  const host = c.req.param("host");
  const body = (await c.req.json()) as CallBody;

  if (!body.uri) {
    return c.json({ error: "uri is required" }, 400);
  }

  try {
    const client = await devicePool.getClient(host);
    const result = await client.call(body.uri, body.payload);
    return c.json({ result });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "SSAP call failed" }, 500);
  }
});

export default call;
```

- [ ] **Step 2: Run type-check**

Run: `bunx tsc --noEmit`
Expected: PASS (all route files now exist)

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/routes/api/call.ts
git commit -m "feat: add generic SSAP call API route"
```

---

### Task 13: Update HTTP server entrypoint

**Files:**
- Modify: `src/modules/http/index.ts`

- [ ] **Step 1: Update imports to use new api directory**

Read current content then apply edit:

Current:
```typescript
import { Hono } from "hono";
import ui from "./routes/ui.tsx";
import api from "./routes/api.ts";

const app = new Hono();

app.route("/", ui);
app.route("/api", api);

export default app;
```

Replace with:
```typescript
import { Hono } from "hono";
import ui from "./routes/ui.tsx";
import api from "./routes/api/index.ts";

const app = new Hono();

app.route("/", ui);
app.route("/api", api);

export default app;
```

- [ ] **Step 2: Run type-check**

Run: `bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/index.ts
git commit -m "feat: wire new API route directory into server"
```

---

### Task 14: Update SSR dashboard

**Files:**
- Modify: `src/modules/http/routes/ui.tsx`
- Modify: `src/modules/http/components/App.tsx`

- [ ] **Step 1: Update App.tsx to show device list**

Replace `src/modules/http/components/App.tsx` content:

```tsx
import type { FC } from "hono/jsx";
import type { DeviceListItem } from "../types.ts";

interface AppProps {
  devices: DeviceListItem[];
}

const App: FC<AppProps> = ({ devices }) => {
  return (
    <html>
      <body>
        <h1>monitor-kvm</h1>
        <p>WebOS Smart Monitor Control</p>

        {devices.length === 0 ? (
          <p>No devices paired. Use the CLI or POST /api/devices/:host/pair to pair a device.</p>
        ) : (
          <div>
            <h2>Paired Devices</h2>
            <ul>
              {devices.map((d) => (
                <li key={d.host}>
                  <strong>{d.host}</strong>
                  {" — "}
                  <span style={{ color: d.connected ? "green" : "red" }}>
                    {d.connected ? "connected" : "disconnected"}
                  </span>
                  {d.pairedAt && <span> — paired {new Date(d.pairedAt).toLocaleString()}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </body>
    </html>
  );
};

export default App;
```

- [ ] **Step 2: Update ui.tsx to pass devices to App**

Current `ui.tsx` renders `<App />` with no props. Import `devicePool` and pass devices:

```tsx
import { Hono } from "hono";
import { reactRenderer } from "@hono/react-renderer";
import App from "../components/App.tsx";
import { devicePool } from "../device-pool.ts";

const ui = new Hono();

ui.get(
  "*",
  reactRenderer(({ children }) => (
    <html>
      <body>{children}</body>
    </html>
  ))
);

ui.get("/", async (c) => {
  const devices = await devicePool.getAllDevices();
  return c.render(<App devices={devices} />);
});

export default ui;
```

- [ ] **Step 3: Run type-check**

Run: `bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/modules/http/components/App.tsx src/modules/http/routes/ui.tsx
git commit -m "feat: SSR dashboard shows paired devices"
```

---

### Task 15: Add `muteStatus` call helper for audio route

The audio GET route calls `client.call("ssap://audio/getMute")` directly. Add a dedicated `getMute` method to WebOSClient.

**Files:**
- Modify: `src/modules/webos/types.ts`
- Modify: `src/modules/webos/client.ts`
- Modify: `src/modules/http/routes/api/audio.ts`

- [ ] **Step 1: Add `getMute` to WebOSClient interface**

In `src/modules/webos/types.ts`, add after `unmute()`:

```typescript
  getMute(): Promise<boolean>;
```

- [ ] **Step 2: Add `getMute` implementation**

In `src/modules/webos/client.ts`, add after `unmute()`:

```typescript
    async getMute() {
      const result = (await conn.send("ssap://audio/getMute")) as { mute?: boolean };
      return result.mute ?? false;
    },
```

- [ ] **Step 3: Update audio route to use `getMute()`**

In `src/modules/http/routes/api/audio.ts`, replace the `getVolume` handler's mute logic:

```typescript
audio.get("/:host/volume", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    const volume = await client.getVolume();
    const muted = await client.getMute();
    return c.json({ volume, muted });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to get volume" }, 500);
  }
});
```

- [ ] **Step 4: Run type-check**

Run: `bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Run tests**

Run: `bun test`
Expected: PASS (existing tests for client should still pass)

- [ ] **Step 6: Commit**

```bash
git add src/modules/webos/types.ts src/modules/webos/client.ts src/modules/http/routes/api/audio.ts
git commit -m "feat: add getMute method to WebOSClient"
```

---

### Task 16: Create HTTP route tests

**Files:**
- Create: `src/modules/http/routes/api/api.test.ts`

- [ ] **Step 1: Write tests**

Use `bun:test` with Hono's `app.request()` for route testing. Mock the `devicePool`.

```typescript
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { Hono } from "hono";
import api from "./index.ts";

// Mock the whole device-pool module
mock.module("../../device-pool.ts", () => {
  return {
    devicePool: {
      getAllDevices: () => [
        { host: "192.168.1.100", connected: true, paired: true, pairedAt: "2026-01-01T00:00:00Z" },
      ],
      getClient: mock((host: string) => {
        if (host === "192.168.1.100") {
          return {
            connected: true,
            getInput: mock(() => "HDMI_1"),
            setInput: mock((_input: string) => {}),
            getBrightness: mock(() => 50),
            setBrightness: mock((_value: number) => {}),
            getVolume: mock(() => 15),
            setVolume: mock((_value: number) => {}),
            getMute: mock(() => false),
            mute: mock(() => {}),
            unmute: mock(() => {}),
            powerOff: mock(() => {}),
            turnOffScreen: mock(() => {}),
            turnOnScreen: mock(() => {}),
            getSystemInfo: mock(() => ({
              modelName: "TestMonitor",
              sdkVersion: "1.0",
              firmwareVersion: "0.1",
            })),
            launchApp: mock((_appId: string, _params?: Record<string, unknown>) => {}),
            call: mock((_uri: string, _payload?: Record<string, unknown>) => ({ ok: true })),
            disconnect: mock(() => {}),
          };
        }
        throw new Error("Device not connected");
      }),
      pairDevice: mock((_host: string, _opts: any) => {}),
      removeDevice: mock((_host: string) => {}),
      forceReconnect: mock((_host: string) => {}),
      getDeviceStatus: mock((host: string) => ({
        host,
        connected: true,
        paired: true,
        modelName: "TestMonitor",
        sdkVersion: "1.0",
        firmwareVersion: "0.1",
      })),
    },
  };
});

function createApp() {
  const app = new Hono();
  app.route("/api", api);
  return app;
}

function apiKey() {
  return "test-key";
}

describe("API routes", () => {
  // Ensure API_KEY is set for all tests
  beforeEach(() => {
    process.env.API_KEY = apiKey();
  });

  describe("GET /api", () => {
    it("returns summary with x-api-key header", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api", {
        headers: { "x-api-key": apiKey() },
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(body.deviceCount).toBe(1);
      expect(body.connectedCount).toBe(1);
    });

    it("returns 401 without x-api-key", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api");
      const res = await app.request(req);
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/devices", () => {
    it("returns device list", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices", {
        headers: { "x-api-key": apiKey() },
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toBeArray();
      expect(body[0].host).toBe("192.168.1.100");
    });
  });

  describe("GET /api/devices/:host/status", () => {
    it("returns device status", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/status", {
        headers: { "x-api-key": apiKey() },
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.host).toBe("192.168.1.100");
      expect(body.connected).toBe(true);
    });
  });

  describe("GET /api/devices/:host/input", () => {
    it("returns current input", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/input", {
        headers: { "x-api-key": apiKey() },
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.input).toBe("HDMI_1");
    });
  });

  describe("POST /api/devices/:host/input", () => {
    it("sets input", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/input", {
        method: "POST",
        headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({ input: "HDMI_2" }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.input).toBe("HDMI_2");
    });

    it("rejects missing input", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/input", {
        method: "POST",
        headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await app.request(req);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/devices/:host/brightness", () => {
    it("returns brightness", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/brightness", {
        headers: { "x-api-key": apiKey() },
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.brightness).toBe(50);
    });
  });

  describe("POST /api/devices/:host/brightness", () => {
    it("sets brightness", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/brightness", {
        method: "POST",
        headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({ value: 75 }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.brightness).toBe(75);
    });

    it("rejects out-of-range brightness", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/brightness", {
        method: "POST",
        headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({ value: 150 }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(400);
    });

    it("rejects non-number brightness", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/brightness", {
        method: "POST",
        headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({ value: "bright" }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/devices/:host/volume", () => {
    it("returns volume and mute state", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/volume", {
        headers: { "x-api-key": apiKey() },
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.volume).toBe(15);
      expect(body.muted).toBe(false);
    });
  });

  describe("POST /api/devices/:host/volume", () => {
    it("sets volume", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/volume", {
        method: "POST",
        headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({ value: 30 }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.volume).toBe(30);
    });
  });

  describe("POST /api/devices/:host/volume/mute", () => {
    it("mutes", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/volume/mute", {
        method: "POST",
        headers: { "x-api-key": apiKey() },
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.muted).toBe(true);
    });
  });

  describe("DELETE /api/devices/:host/volume/mute", () => {
    it("unmutes", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/volume/mute", {
        method: "DELETE",
        headers: { "x-api-key": apiKey() },
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.muted).toBe(false);
    });
  });

  describe("POST /api/devices/:host/power/off", () => {
    it("powers off", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/power/off", {
        method: "POST",
        headers: { "x-api-key": apiKey() },
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/devices/:host/power/screen/off", () => {
    it("turns screen off", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/power/screen/off", {
        method: "POST",
        headers: { "x-api-key": apiKey() },
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/devices/:host/power/screen/on", () => {
    it("turns screen on", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/power/screen/on", {
        method: "POST",
        headers: { "x-api-key": apiKey() },
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/devices/:host/app/:appId", () => {
    it("launches app", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/app/com.webos.app.hdmi1", {
        method: "POST",
        headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.launched).toBe(true);
    });
  });

  describe("POST /api/devices/:host/call", () => {
    it("calls SSAP endpoint", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/call", {
        method: "POST",
        headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({ uri: "ssap://system/getSystemInfo" }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result).toEqual({ ok: true });
    });

    it("rejects missing uri", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/call", {
        method: "POST",
        headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await app.request(req);
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/devices/:host/pair", () => {
    it("pairs a device", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.200/pair", {
        method: "POST",
        headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({ pairingType: "PROMPT" }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
    });
  });

  describe("DELETE /api/devices/:host/pair", () => {
    it("unpairs a device", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/pair", {
        method: "DELETE",
        headers: { "x-api-key": apiKey() },
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/devices/:host/reconnect", () => {
    it("reconnects a device", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/reconnect", {
        method: "POST",
        headers: { "x-api-key": apiKey() },
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/devices/:host/services", () => {
    it("returns service list", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/services", {
        headers: { "x-api-key": apiKey() },
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.services).toBeArray();
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `bun test src/modules/http/routes/api/api.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/routes/api/api.test.ts
git commit -m "test: add HTTP route tests for all API endpoints"
```

---

### Task 17: Add services route (was in route plan but missing)

**Files:**
- Create: `src/modules/http/routes/api/services.ts`
- Modify: `src/modules/http/routes/api/index.ts`

- [ ] **Step 1: Write services route**

```typescript
import { Hono } from "hono";
import { devicePool } from "../../device-pool.ts";

const services = new Hono();

services.get("/:host/services", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    const svcList = await client.getServiceList();
    return c.json({ services: svcList });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to get services" }, 500);
  }
});

export default services;
```

- [ ] **Step 2: Add services route to index.ts**

In `src/modules/http/routes/api/index.ts`, add import and route:

```typescript
import servicesRoutes from "./services.ts";

// ... inside, add after callRoutes:
api.route("/devices", servicesRoutes);
```

- [ ] **Step 3: Run type-check and tests**

Run: `bunx tsc --noEmit`
Run: `bun test src/modules/http/routes/api/api.test.ts`
Expected: Both PASS

- [ ] **Step 4: Commit**

```bash
git add src/modules/http/routes/api/services.ts src/modules/http/routes/api/index.ts
git commit -m "feat: add services list API route"
```

---

### Task 18: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Full type-check**

Run: `bunx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 2: All tests**

Run: `bun test`
Expected: All existing + new tests PASS

- [ ] **Step 3: Start server and verify with curl**

```bash
bun dev
```

In another terminal:
```bash
curl -H "x-api-key: change-me" http://localhost:3000/api
curl -H "x-api-key: change-me" http://localhost:3000/api/devices
```

- [ ] **Step 4: Verify SSR page**

Visit `http://localhost:3000/` in browser. Should show "monitor-kvm" heading and device list (empty if none paired).

---

## Self-Review

### 1. Spec coverage check

| Decision | Covered by |
|---|---|
| Lazy connect + auto-reconnect | Task 4 (DevicePool.getClient) |
| 3-retry then dead | Inherited from ConnectionManager |
| Single blocking POST /pair | Task 7 (device route) |
| 15 endpoints | Tasks 6-12, 17 |
| `{ error: string }` errors | All route tasks |
| Wrapped GET responses | Tasks 8-12 |
| `{ value: X }` POST bodies | Tasks 8-10 |
| 404 for unpaired | All route error handlers |
| Pass-through validation | Tasks 8-10 (no pre-validation except ranges) |
| Full SystemInfo + status | Task 7 |
| host/connected/paired/pairedAt list | Task 7 |
| 0-100 range validation | Tasks 9-10 |
| Pool in device-pool.ts | Task 4 |
| CORS middleware | Task 3 |
| SSR dashboard | Task 14 |
| Mock pool tests | Task 16 |
| Unrestricted call | Task 12 |
| Disconnected status 200 + nulls | Task 7 (getDeviceStatus) |
| Types in http/types.ts | Task 2 |
| routes/api/ directory | Tasks 5-12, 17 |
| GET /api summary | Task 6 |
| Auto-reconnect on action | Task 4 (getClient always reconnects) |
| getMute method added | Task 15 |
| `connected` property added | Task 1 |

### 2. Placeholder scan
No TBDs, TODOs, or placeholder text. All tasks have complete code.

### 3. Type consistency
- `Connected` field exists on `WebOSClient` (Task 1) before `DevicePool` references `client.connected` (Task 4).
- `getMute` added to interface (Task 15) before audio route uses it (Task 15 step 3).
- All request/response types in `types.ts` (Task 2) match route usage.
- Import paths verified against final file layout.
