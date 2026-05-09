# PIN Pairing Brightness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement two-step dashboard PIN pairing so monitors can be paired with the trust level needed for brightness APIs.

**Architecture:** Add a deferred PIN pairing primitive in `src/modules/webos/index.ts`, then wrap it in `DevicePool` with one pending session per host. Add two HTTP endpoints for start/submit and update `PairModal` to use those endpoints only for PIN mode while preserving the current PROMPT flow.

**Tech Stack:** Bun, TypeScript, Hono, React, TanStack Query, `ws`, existing Bun tests.

---

## File Map

- Modify `src/modules/webos/types.ts`: add `PinPairingSession` type.
- Modify `src/modules/webos/index.ts`: add `beginPinPairing()` and refactor `pair()` PIN mode to use it.
- Modify `src/modules/webos/webos.test.ts`: add mocked PIN prompt behavior and tests for deferred PIN pairing.
- Modify `src/modules/http/device-pool.ts`: manage pending PIN sessions and expose `startPinPairing()` / `submitPinPairing()`.
- Modify `src/modules/http/routes/api/device.ts`: add `POST /:host/pair/pin/start` and `POST /:host/pair/pin/submit`.
- Modify `src/modules/http/routes/api/api.test.ts`: add route tests for PIN start/submit.
- Modify `src/modules/http/hooks/usePairDevice.ts`: add PIN start and submit mutations.
- Modify `src/modules/http/components/PairModal.tsx`: make PIN pairing a two-step UI.

## Task 1: Add Deferred PIN Pairing To WebOS Module

**Files:**
- Modify: `src/modules/webos/types.ts`
- Modify: `src/modules/webos/webos.test.ts`
- Modify: `src/modules/webos/index.ts`

- [ ] **Step 1: Add the failing deferred PIN pairing test**

In `src/modules/webos/webos.test.ts`, update `MockWebSocket.send()` so PIN registration emits a PIN prompt response and `pairing/setPin` returns a client key:

```ts
if (msg.type === "register") {
  if (msg.payload?.pairingType === "PIN") {
    queueMicrotask(() => {
      this.emit(
        "message",
        Buffer.from(
          JSON.stringify({
            id: "0",
            type: "response",
            payload: { pairingType: "PIN" },
          })
        )
      );
    });
  } else if (msg.payload?.["client-key"]) {
    queueMicrotask(() => {
      this.emit(
        "message",
        Buffer.from(JSON.stringify({ id: "0", type: "registered" }))
      );
    });
  } else {
    queueMicrotask(() => {
      this.emit(
        "message",
        Buffer.from(
          JSON.stringify({
            id: "0",
            type: "registered",
            payload: { clientKey: "mock-client-key" },
          })
        )
      );
    });
  }
} else if (msg.type === "request" && msg.uri === "ssap://pairing/setPin") {
  queueMicrotask(() => {
    this.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          id: msg.id,
          type: "registered",
          payload: { clientKey: `pin-key-${msg.payload.pin}` },
        })
      )
    );
  });
} else if (msg.type === "request") {
```

Then import `beginPinPairing` with the public API imports and add this test under `describe("public API", ...)`:

```ts
test("beginPinPairing waits for submitPin before storing clientKey", async () => {
  const path = join(tmpDir, "creds.json");
  const session = await beginPinPairing({
    host: "192.168.1.100",
    credentialsPath: path,
  });

  expect(await getClientKey("192.168.1.100", path)).toBeUndefined();

  await session.submitPin("123456");

  expect(await getClientKey("192.168.1.100", path)).toBe("pin-key-123456");
});
```

- [ ] **Step 2: Run the focused failing test**

Run: `bun test src/modules/webos/webos.test.ts`

Expected: FAIL because `beginPinPairing` is not exported yet.

- [ ] **Step 3: Add the session type**

In `src/modules/webos/types.ts`, add after `PairOptions`:

```ts
export interface PinPairingSession {
  host: string;
  submitPin(pin: string): Promise<void>;
  cancel(): void;
}
```

- [ ] **Step 4: Implement deferred PIN pairing**

In `src/modules/webos/index.ts`, add `PinPairingSession` to the type imports and replace the PIN branch in `pair()` with a call to `beginPinPairing()`:

```ts
if (pairingType === "PIN") {
  const session = await beginPinPairing({
    host,
    credentialsPath,
    timeoutMs,
    onPairingPrompt,
  });
  const code = typeof pin === "function" ? await pin() : pin;
  await session.submitPin(String(code));
  return;
}
```

Then add this exported function above `connect()`:

```ts
export async function beginPinPairing(
  options: Omit<PairOptions, "pairingType" | "pin">
): Promise<PinPairingSession> {
  const { host, credentialsPath, timeoutMs = 60000, onPairingPrompt } = options;

  const existing = await getClientKey(host, credentialsPath);
  if (existing) {
    throw new Error(
      `Already paired with ${host}. Use forgetCredentials() first to re-pair.`
    );
  }

  const url = `wss://${host}:3001`;
  const ws = new WebSocket(url, {
    tls: { rejectUnauthorized: false },
    minVersion: "TLSv1" as any,
    maxVersion: "TLSv1.3" as any,
  } as any);

  return new Promise((resolve, reject) => {
    let settled = false;
    let submitPin: ((pin: string) => Promise<void>) | undefined;

    const cleanup = () => {
      clearTimeout(timer);
      ws.removeListener("open", onOpen);
      ws.removeListener("message", onMessage);
      ws.removeListener("error", onError);
      ws.removeListener("close", onClose);
      ws.on("error", () => {});
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const timer = setTimeout(() => {
      fail(new Error("PIN pairing timed out."));
    }, timeoutMs);

    const onOpen = () => {
      onPairingPrompt?.();
      ws.send(JSON.stringify(registerMessage(undefined, "PIN")));
    };

    const onMessage = (data: WebSocket.RawData) => {
      const msg = parseMessage(data);
      if (!msg) return;

      if (msg.type === "response" && msg.payload?.pairingType === "PIN") {
        submitPin = (pin: string) =>
          new Promise((submitResolve, submitReject) => {
            const pinReq = {
              type: "request",
              id: "pin_1",
              uri: "ssap://pairing/setPin",
              payload: { pin },
            };

            const onPinMessage = (pinData: WebSocket.RawData) => {
              const pinMsg = parseMessage(pinData);
              if (!pinMsg) return;

              if (
                (pinMsg.type === "registered" || pinMsg.type === "response") &&
                pinMsg.payload
              ) {
                const key = pinMsg.payload.clientKey ?? pinMsg.payload["client-key"];
                if (key) {
                  ws.removeListener("message", onPinMessage);
                  setClientKey(host, String(key), credentialsPath)
                    .then(() => {
                      cleanup();
                      submitResolve();
                    })
                    .catch(submitReject);
                  return;
                }
              }

              if (pinMsg.type === "error") {
                ws.removeListener("message", onPinMessage);
                submitReject(new Error(pinMsg.error ?? "PIN pairing failed"));
              }
            };

            ws.on("message", onPinMessage);
            ws.send(JSON.stringify(pinReq));
          });

        settled = true;
        resolve({
          host,
          submitPin: (pin: string) => submitPin!(pin),
          cancel: cleanup,
        });
        return;
      }

      if (msg.type === "error" && msg.id === "0") {
        fail(new Error(msg.error ?? "PIN pairing failed"));
      }
    };

    const onError = (err: Error) => fail(new Error(`WebSocket error during PIN pairing: ${err.message}`));
    const onClose = () => fail(new Error("WebSocket closed during PIN pairing"));

    ws.on("open", onOpen);
    ws.on("message", onMessage);
    ws.on("error", onError);
    ws.on("close", onClose);
  });
}
```

- [ ] **Step 5: Run the focused test**

Run: `bun test src/modules/webos/webos.test.ts`

Expected: PASS.

## Task 2: Add Pending PIN Sessions To Device Pool

**Files:**
- Modify: `src/modules/http/device-pool.ts`

- [ ] **Step 1: Import the new primitive and type**

Change imports at the top of `src/modules/http/device-pool.ts`:

```ts
import { connect, pair, forgetCredentials, beginPinPairing } from "../webos/index.ts";
import type { WebOSClient, PairOptions, PinPairingSession } from "../webos/types.ts";
```

- [ ] **Step 2: Add the pending session map**

Inside `class DevicePool`, add:

```ts
private pendingPinPairings = new Map<string, PinPairingSession>();
```

- [ ] **Step 3: Add start/submit methods**

Inside `class DevicePool`, add below `pairDevice()`:

```ts
async startPinPairing(host: string): Promise<void> {
  const existing = this.pendingPinPairings.get(host);
  if (existing) {
    existing.cancel();
    this.pendingPinPairings.delete(host);
  }

  const session = await beginPinPairing({
    host,
    credentialsPath: this.credentialsPath,
    timeoutMs: 60000,
  });

  this.pendingPinPairings.set(host, session);
}

async submitPinPairing(host: string, pin: string): Promise<void> {
  const session = this.pendingPinPairings.get(host);
  if (!session) {
    throw new Error("No pending PIN pairing session. Start PIN pairing again.");
  }

  try {
    await session.submitPin(pin);
    const client = await connect({
      host,
      credentialsPath: this.credentialsPath,
    });
    this.clients.set(host, {
      client,
      host,
      pairedAt: new Date().toISOString(),
    });
  } finally {
    this.pendingPinPairings.delete(host);
  }
}
```

- [ ] **Step 4: Run typecheck for this layer**

Run: `bunx tsc --noEmit`

Expected: PASS or only errors unrelated to this change. Fix any errors in edited files before continuing.

## Task 3: Add HTTP PIN Pairing Routes

**Files:**
- Modify: `src/modules/http/routes/api/api.test.ts`
- Modify: `src/modules/http/routes/api/device.ts`

- [ ] **Step 1: Add failing API route tests**

In the `devicePool` mock in `src/modules/http/routes/api/api.test.ts`, add:

```ts
startPinPairing: mock((_host: string) => {}),
submitPinPairing: mock((_host: string, _pin: string) => {}),
```

Then add these tests near the existing pair route tests:

```ts
it("starts PIN pairing", async () => {
  const app = createApp();
  const req = new Request("http://localhost/api/devices/192.168.1.100/pair/pin/start", {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
  });
  const res = await app.request(req);
  expect(res.status).toBe(200);
  const body = await res.json() as any;
  expect(body).toEqual({ pending: true, host: "192.168.1.100" });
});

it("submits PIN pairing", async () => {
  const app = createApp();
  const req = new Request("http://localhost/api/devices/192.168.1.100/pair/pin/submit", {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ pin: "123456" }),
  });
  const res = await app.request(req);
  expect(res.status).toBe(200);
  const body = await res.json() as any;
  expect(body).toEqual({ paired: true, host: "192.168.1.100" });
});

it("rejects missing PIN on submit", async () => {
  const app = createApp();
  const req = new Request("http://localhost/api/devices/192.168.1.100/pair/pin/submit", {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({}),
  });
  const res = await app.request(req);
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run the failing API tests**

Run: `bun test src/modules/http/routes/api/api.test.ts`

Expected: FAIL with 404 for the new routes.

- [ ] **Step 3: Add the routes**

In `src/modules/http/routes/api/device.ts`, add above the existing `device.post("/:host/pair", ...)` route:

```ts
device.post("/:host/pair/pin/start", async (c) => {
  const host = c.req.param("host");

  try {
    await devicePool.startPinPairing(host);
    return c.json({ pending: true, host });
  } catch (err: any) {
    return c.json({ error: err.message ?? "PIN pairing failed" }, 500);
  }
});

device.post("/:host/pair/pin/submit", async (c) => {
  const host = c.req.param("host");
  const body = (await c.req.json().catch(() => ({}))) as { pin?: unknown };

  if (typeof body.pin !== "string" || body.pin.trim() === "") {
    return c.json({ error: "pin is required" }, 400);
  }

  try {
    await devicePool.submitPinPairing(host, body.pin.trim());
    return c.json({ paired: true, host });
  } catch (err: any) {
    return c.json({ error: err.message ?? "PIN pairing failed" }, 500);
  }
});
```

- [ ] **Step 4: Run the API tests**

Run: `bun test src/modules/http/routes/api/api.test.ts`

Expected: PASS.

## Task 4: Update Dashboard Pairing UI

**Files:**
- Modify: `src/modules/http/hooks/usePairDevice.ts`
- Modify: `src/modules/http/components/PairModal.tsx`

- [ ] **Step 1: Add PIN mutations**

In `src/modules/http/hooks/usePairDevice.ts`, add:

```ts
export function useStartPinPairing() {
  return useMutation({
    mutationFn: ({ host }: { host: string }) =>
      apiFetch(`/devices/${host}/pair/pin/start`, {
        method: "POST",
      }),
  });
}

export function useSubmitPinPairing() {
  return useMutation({
    mutationFn: ({ host, pin }: { host: string; pin: string }) =>
      apiFetch(`/devices/${host}/pair/pin/submit`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}
```

- [ ] **Step 2: Refactor `PairModal` state and submit handler**

In `src/modules/http/components/PairModal.tsx`, change the import to:

```ts
import { usePairDevice, useStartPinPairing, useSubmitPinPairing } from "../hooks/usePairDevice.ts";
```

Add state and hooks:

```ts
const [pinStep, setPinStep] = useState<"host" | "pin">("host");
const startPinPairing = useStartPinPairing();
const submitPinPairing = useSubmitPinPairing();
```

Replace `handleSubmit` with:

```ts
const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  const trimmedHost = host.trim();
  if (!trimmedHost) return;

  setIsPairing(true);
  setCountdown(60);

  const timer = setInterval(() => {
    setCountdown((c) => {
      if (c <= 1) {
        clearInterval(timer);
        return 0;
      }
      return c - 1;
    });
  }, 1000);

  try {
    if (pairingType === "PIN") {
      if (pinStep === "host") {
        await startPinPairing.mutateAsync({ host: trimmedHost });
        clearInterval(timer);
        setIsPairing(false);
        setPinStep("pin");
        addToast("Enter the PIN shown on the monitor", "success");
        return;
      }

      await submitPinPairing.mutateAsync({ host: trimmedHost, pin: pin.trim() });
    } else {
      await pair.mutateAsync({
        host: trimmedHost,
        pairingType,
      });
    }

    clearInterval(timer);
    addToast("Device paired successfully", "success");
    onClose();
  } catch (err: any) {
    clearInterval(timer);
    addToast(err.message ?? "Pairing failed", "error");
    setIsPairing(false);
  }
};
```

- [ ] **Step 3: Update PIN form rendering**

In `PairModal`, keep the host input disabled when `pinStep === "pin"`, show the PIN input only when `pairingType === "PIN" && pinStep === "pin"`, and change the submit button label:

```tsx
disabled={isPairing || pinStep === "pin"}
```

```tsx
{pairingType === "PIN" && pinStep === "pin" && (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      PIN Code
    </label>
    <input
      type="text"
      value={pin}
      onChange={(e) => setPin(e.target.value)}
      placeholder="Enter PIN shown on screen"
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      disabled={isPairing}
      required
    />
  </div>
)}
```

```tsx
{isPairing
  ? "Pairing..."
  : pairingType === "PIN" && pinStep === "host"
    ? "Show PIN"
    : "Pair"}
```

- [ ] **Step 4: Run typecheck**

Run: `bunx tsc --noEmit`

Expected: PASS.

## Task 5: Verify Against The Real Monitor

**Files:**
- No source edits expected.

- [ ] **Step 1: Run all automated tests**

Run: `bun test`

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `bunx tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Re-pair `192.168.1.17` with PIN trust**

In the dashboard, remove the existing device credentials for `192.168.1.17`, add the device again, select PIN pairing, click `Show PIN`, enter the PIN shown on the monitor, and complete pairing.

- [ ] **Step 4: Run read-only API scan**

Run: `bun run scripts/scan-apis.ts 192.168.1.17`

Expected: `config/getConfigs (brightness)` no longer returns `401 insufficient permissions`. If it still returns 401, brightness control is unavailable even with PIN trust and should move to a separate OSD fallback design.

- [ ] **Step 5: Test dashboard brightness slider**

Open the dashboard, select `192.168.1.17`, set a brightness value, and verify the toast is `Brightness updated` instead of `404 no such service or method` or `401 insufficient permissions`.

## Plan Self-Review

- Spec coverage: Tasks cover deferred PIN pairing, HTTP start/submit routes, dashboard two-step UI, PROMPT preservation, tests, typecheck, and real monitor verification.
- Placeholder scan: No TBD/TODO/fill-in placeholders remain.
- Type consistency: `PinPairingSession`, `beginPinPairing`, `startPinPairing`, and `submitPinPairing` names are consistent across tasks.
- Commit note: This plan intentionally omits commit steps because the current workspace instructions forbid commits unless the user explicitly requests one.
