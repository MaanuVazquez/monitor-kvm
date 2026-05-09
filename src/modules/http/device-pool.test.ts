import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DevicePool } from "./device-pool.ts";
import type { ConnectOptions, ForgetOptions, PinPairingSession, WebOSClient } from "../webos/types.ts";

let beginPinPairingQueue: Array<() => Promise<PinPairingSession>> = [];
let connectImpl: (options: ConnectOptions) => Promise<WebOSClient>;

const beginPinPairingMock = mock(() => {
  const next = beginPinPairingQueue.shift();
  return next ? next() : Promise.resolve(createSession());
});
const connectMock = mock((options: ConnectOptions) => connectImpl(options));
const pairMock = mock(() => Promise.resolve());
const forgetCredentialsMock = mock((_options: ForgetOptions) => Promise.resolve());

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createClient(): WebOSClient {
  return {
    connected: true,
    call: mock(() => Promise.resolve({})),
    setInput: mock(() => Promise.resolve()),
    getInput: mock(() => Promise.resolve("HDMI_1")),
    setBrightness: mock(() => Promise.resolve()),
    getBrightness: mock(() => Promise.resolve(50)),
    setVolume: mock(() => Promise.resolve()),
    getVolume: mock(() => Promise.resolve(15)),
    mute: mock(() => Promise.resolve()),
    unmute: mock(() => Promise.resolve()),
    getMute: mock(() => Promise.resolve(false)),
    powerOff: mock(() => Promise.resolve()),
    turnOffScreen: mock(() => Promise.resolve()),
    turnOnScreen: mock(() => Promise.resolve()),
    getSystemInfo: mock(() => Promise.resolve({
      modelName: "TestMonitor",
      sdkVersion: "1.0",
      firmwareVersion: "0.1",
    })),
    getServiceList: mock(() => Promise.resolve([])),
    launchApp: mock(() => Promise.resolve()),
    sendRemoteButton: mock(() => Promise.resolve()),
    disconnect: mock(() => Promise.resolve()),
  };
}

function createSession(submitPin = mock(() => Promise.resolve())): PinPairingSession {
  return {
    host: "192.168.1.100",
    submitPin,
    cancel: mock(() => {}),
  };
}

function createPool() {
  return new DevicePool(undefined, {
    beginPinPairing: beginPinPairingMock,
    connect: connectMock,
    pair: pairMock,
    forgetCredentials: forgetCredentialsMock,
    getAllHosts: mock(() => Promise.resolve([])),
  }) as any;
}

describe("DevicePool PIN pairing sessions", () => {
  beforeEach(() => {
    beginPinPairingQueue = [];
    connectImpl = () => Promise.resolve(createClient());
    beginPinPairingMock.mockClear();
    connectMock.mockClear();
    pairMock.mockClear();
    forgetCredentialsMock.mockClear();
  });

  test("pairDevice disconnects an existing client before replacing it", async () => {
    const oldClient = createClient();
    const pool = createPool();
    pool.clients.set("192.168.1.100", {
      client: oldClient,
      host: "192.168.1.100",
      pairedAt: "2026-01-01T00:00:00Z",
    });

    await pool.pairDevice("192.168.1.100", {});

    expect(oldClient.disconnect).toHaveBeenCalled();
  });

  test("removeDevice invalidates an in-flight PIN submit", async () => {
    const submit = deferred<void>();
    const session = createSession(mock(() => submit.promise));
    beginPinPairingQueue.push(() => Promise.resolve(session));
    const pool = createPool();

    await pool.startPinPairing("192.168.1.100");
    const submitPromise = pool.submitPinPairing("192.168.1.100", "1234").catch((err: Error) => err);
    await pool.removeDevice("192.168.1.100");
    submit.resolve();
    await submitPromise;

    expect(connectMock).not.toHaveBeenCalled();
    expect(pool.clients.has("192.168.1.100")).toBe(false);
  });

  test("cancelPinPairing cancels and removes a pending PIN session", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const timeoutId = {};
    const clearTimeoutMock = mock((_id: unknown) => {});
    (globalThis as any).setTimeout = mock(() => timeoutId);
    (globalThis as any).clearTimeout = clearTimeoutMock;

    try {
      const session = createSession();
      beginPinPairingQueue.push(() => Promise.resolve(session));
      const pool = createPool();

      await pool.startPinPairing("192.168.1.100");
      pool.cancelPinPairing("192.168.1.100");

      expect(session.cancel).toHaveBeenCalled();
      expect(clearTimeoutMock).toHaveBeenCalledWith(timeoutId);
      expect(pool.pendingPinPairings.has("192.168.1.100")).toBe(false);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  test("cancelPinPairing is safe without a pending PIN session", () => {
    const pool = createPool();

    expect(() => pool.cancelPinPairing("192.168.1.100")).not.toThrow();
  });

  test("stale submit cleanup does not delete a newer PIN session", async () => {
    const submit = deferred<void>();
    const oldSession = createSession(mock(() => submit.promise));
    const newSession = createSession();
    beginPinPairingQueue.push(
      () => Promise.resolve(oldSession),
      () => Promise.resolve(newSession),
    );
    const pool = createPool();

    await pool.startPinPairing("192.168.1.100");
    const submitPromise = pool.submitPinPairing("192.168.1.100", "1234").catch(() => {});
    await pool.startPinPairing("192.168.1.100");
    submit.resolve();
    await submitPromise;

    expect(pool.pendingPinPairings.get("192.168.1.100")?.session).toBe(newSession);
  });

  test("concurrent PIN starts cancel stale sessions", async () => {
    const firstStart = deferred<PinPairingSession>();
    const secondStart = deferred<PinPairingSession>();
    const firstSession = createSession();
    const secondSession = createSession();
    beginPinPairingQueue.push(
      () => firstStart.promise,
      () => secondStart.promise,
    );
    const pool = createPool();

    const first = pool.startPinPairing("192.168.1.100");
    const second = pool.startPinPairing("192.168.1.100");
    firstStart.resolve(firstSession);
    secondStart.resolve(secondSession);
    await Promise.all([first, second]);

    expect(firstSession.cancel).toHaveBeenCalled();
    expect(pool.pendingPinPairings.get("192.168.1.100")?.session).toBe(secondSession);
  });

  test("expires a pending PIN session after the prompt timeout", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    let timeoutCallback: (() => void) | undefined;
    let timeoutMs: number | undefined;
    const timeoutId = {};
    (globalThis as any).setTimeout = mock((callback: () => void, delay: number) => {
      timeoutCallback = callback;
      timeoutMs = delay;
      return timeoutId;
    });
    (globalThis as any).clearTimeout = mock(() => {});

    try {
      const session = createSession();
      beginPinPairingQueue.push(() => Promise.resolve(session));
      const pool = createPool();

      await pool.startPinPairing("192.168.1.100");
      timeoutCallback?.();

      expect(timeoutMs).toBe(60000);
      expect(session.cancel).toHaveBeenCalled();
      expect(pool.pendingPinPairings.has("192.168.1.100")).toBe(false);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  test("clears stale PIN prompt timeout when replacing the session", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const callbacks: Array<() => void> = [];
    const timeoutIds = [{ id: 1 }, { id: 2 }];
    const clearTimeoutMock = mock((_id: unknown) => {});
    (globalThis as any).setTimeout = mock((callback: () => void) => {
      callbacks.push(callback);
      return timeoutIds[callbacks.length - 1];
    });
    (globalThis as any).clearTimeout = clearTimeoutMock;

    try {
      const firstSession = createSession();
      const secondSession = createSession();
      beginPinPairingQueue.push(
        () => Promise.resolve(firstSession),
        () => Promise.resolve(secondSession),
      );
      const pool = createPool();

      await pool.startPinPairing("192.168.1.100");
      await pool.startPinPairing("192.168.1.100");
      callbacks[0]?.();

      expect(clearTimeoutMock).toHaveBeenCalledWith(timeoutIds[0]);
      expect(pool.pendingPinPairings.get("192.168.1.100")?.session).toBe(secondSession);
      expect(secondSession.cancel).not.toHaveBeenCalled();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  test("successful PIN submit disconnects an existing client before replacing it", async () => {
    const session = createSession();
    const oldClient = createClient();
    beginPinPairingQueue.push(() => Promise.resolve(session));
    const pool = createPool();
    pool.clients.set("192.168.1.100", {
      client: oldClient,
      host: "192.168.1.100",
      pairedAt: "2026-01-01T00:00:00Z",
    });

    await pool.startPinPairing("192.168.1.100");
    await pool.submitPinPairing("192.168.1.100", "1234");

    expect(oldClient.disconnect).toHaveBeenCalled();
  });

  test("duplicate PIN submit rejects without deleting the active session", async () => {
    const submit = deferred<void>();
    let calls = 0;
    const submitPin = mock(() => {
      calls += 1;
      return calls === 1 ? submit.promise : Promise.reject(new Error("PIN already submitted."));
    });
    const session = createSession(submitPin);
    beginPinPairingQueue.push(() => Promise.resolve(session));
    const pool = createPool();

    await pool.startPinPairing("192.168.1.100");
    const firstSubmit = pool.submitPinPairing("192.168.1.100", "1234");
    const secondSubmit = pool.submitPinPairing("192.168.1.100", "1234").catch((err: Error) => err);
    const secondError = await secondSubmit;

    expect(secondError).toBeInstanceOf(Error);
    expect(submitPin).toHaveBeenCalledTimes(1);
    expect(pool.pendingPinPairings.get("192.168.1.100")?.session).toBe(session);

    submit.resolve();
    await firstSubmit;
  });
});
