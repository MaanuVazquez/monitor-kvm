import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EventEmitter from "node:events";

import {
  parseMessage,
  registerMessage,
  requestMessage,
  isResponse,
} from "./protocol.ts";
import {
  getClientKey,
  setClientKey,
  removeClientKey,
} from "./credentials.ts";
import { validateInput, isKnownInput } from "./validation.ts";

let tmpDir: string;
const pointerSocketMessages: string[] = [];
let pointerSocketPath = "wss://192.168.1.100:3001/resources/mock/netinput.pointer.sock";

beforeEach(async () => {
  tmpDir = join(tmpdir(), `monitor-kvm-test-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  delete process.env.MONITOR_KVM_CREDENTIALS;
  delete process.env.MONITOR_KVM_POINTER_TIMEOUT_MS;
  pointerSocketMessages.length = 0;
  pointerSocketPath = "wss://192.168.1.100:3001/resources/mock/netinput.pointer.sock";
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("protocol", () => {
  test("registerMessage without clientKey", () => {
    const msg = registerMessage();
    expect(msg.id).toBe("0");
    expect(msg.type).toBe("register");
    expect(msg.payload?.forcePairing).toBe(false);
    expect(msg.payload?.pairingType).toBe("PROMPT");
    expect(msg.payload?.manifest).toBeDefined();
    expect(msg.payload?.["client-key"]).toBeUndefined();
  });

  test("registerMessage with clientKey", () => {
    const msg = registerMessage("abc123");
    expect(msg.payload?.["client-key"]).toBe("abc123");
    expect(msg.payload?.pairingType).toBeUndefined();
    expect(msg.payload?.manifest).toBeDefined();
  });

  test("requestMessage", () => {
    const msg = requestMessage("42", "ssap://test", { foo: "bar" });
    expect(msg.id).toBe("42");
    expect(msg.type).toBe("request");
    expect(msg.uri).toBe("ssap://test");
    expect(msg.payload).toEqual({ foo: "bar" });
  });

  test("parseMessage string", () => {
    const msg = parseMessage('{"id":"1","type":"response","payload":{"x":1}}');
    expect(msg).not.toBeNull();
    expect(msg?.id).toBe("1");
    expect(msg?.type).toBe("response");
    expect(msg?.payload).toEqual({ x: 1 });
  });

  test("parseMessage Buffer", () => {
    const buf = Buffer.from('{"id":"2","type":"error","error":"fail"}');
    const msg = parseMessage(buf);
    expect(msg?.type).toBe("error");
    expect(msg?.error).toBe("fail");
  });

  test("parseMessage ArrayBuffer", () => {
    const str = '{"id":"3","type":"response"}';
    const ab = new TextEncoder().encode(str).buffer;
    const msg = parseMessage(ab);
    expect(msg?.id).toBe("3");
  });

  test("parseMessage Buffer array", () => {
    const str = '{"id":"4","type":"response"}';
    const bufs = [Buffer.from(str)];
    const msg = parseMessage(bufs);
    expect(msg?.id).toBe("4");
  });

  test("parseMessage invalid JSON returns null", () => {
    expect(parseMessage("not json")).toBeNull();
  });

  test("parseMessage missing id returns null", () => {
    expect(parseMessage('{"type":"response"}')).toBeNull();
  });

  test("isResponse", () => {
    expect(isResponse({ id: "1", type: "response" }, "1")).toBeTrue();
    expect(isResponse({ id: "1", type: "error" }, "1")).toBeTrue();
    expect(isResponse({ id: "1", type: "request" }, "1")).toBeFalse();
    expect(isResponse({ id: "1", type: "response" }, "2")).toBeFalse();
  });
});

describe("credentials", () => {
  test("getClientKey returns undefined when file does not exist", async () => {
    const key = await getClientKey("192.168.1.1", join(tmpDir, "creds.json"));
    expect(key).toBeUndefined();
  });

  test("setClientKey creates file and stores key", async () => {
    const path = join(tmpDir, "creds.json");
    await setClientKey("192.168.1.1", "key123", path);
    const key = await getClientKey("192.168.1.1", path);
    expect(key).toBe("key123");

    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.hosts["192.168.1.1"].clientKey).toBe("key123");
    expect(parsed.hosts["192.168.1.1"].pairedAt).toBeString();
  });

  test("setClientKey updates existing host", async () => {
    const path = join(tmpDir, "creds.json");
    await setClientKey("host-a", "key1", path);
    await setClientKey("host-a", "key2", path);
    const key = await getClientKey("host-a", path);
    expect(key).toBe("key2");
  });

  test("multiple hosts are isolated", async () => {
    const path = join(tmpDir, "creds.json");
    await setClientKey("host-a", "key-a", path);
    await setClientKey("host-b", "key-b", path);
    expect(await getClientKey("host-a", path)).toBe("key-a");
    expect(await getClientKey("host-b", path)).toBe("key-b");
  });

  test("removeClientKey deletes host", async () => {
    const path = join(tmpDir, "creds.json");
    await setClientKey("host-a", "key-a", path);
    await removeClientKey("host-a", path);
    expect(await getClientKey("host-a", path)).toBeUndefined();
  });

  test("removeClientKey from non-existing file does not throw", async () => {
    const path = join(tmpDir, "creds.json");
    await removeClientKey("host-a", path);
    expect(await getClientKey("host-a", path)).toBeUndefined();
  });
});

describe("validation", () => {
  test("isKnownInput true for HDMI_1", () => {
    expect(isKnownInput("HDMI_1")).toBeTrue();
  });

  test("isKnownInput false for unknown", () => {
    expect(isKnownInput("DP_1")).toBeFalse();
  });

  test("validateInput passes for known model and valid input", () => {
    expect(() => validateInput("OLED55C1PUB", "HDMI_1")).not.toThrow();
  });

  test("validateInput throws for known model and invalid input", () => {
    expect(() => validateInput("OLED55C1PUB", "DP_1")).toThrow("Invalid input");
  });

  test("validateInput warns and passes for unknown model", () => {
    const warnMock = mock(() => {});
    const originalWarn = console.warn;
    console.warn = warnMock as typeof console.warn;

    expect(() => validateInput("UNKNOWN_MODEL", "HDMI_1")).not.toThrow();
    expect(warnMock).toHaveBeenCalledTimes(1);

    console.warn = originalWarn;
  });
});

class MockWebSocket extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  url: string;
  opts: unknown;

  constructor(url: string, opts?: unknown) {
    super();
    this.url = url;
    this.opts = opts;
    MockWebSocket.instances.push(this);
    if (url.includes("timeout.pointer.sock")) return;
    queueMicrotask(() => {
      if (this.readyState !== MockWebSocket.CLOSED) {
        this.readyState = MockWebSocket.OPEN;
        this.emit("open");
      }
    });
  }

  send(data: string | Buffer, cb?: (err?: Error) => void) {
    if (this.url.includes("netinput.pointer.sock")) {
      pointerSocketMessages.push(String(data));
      cb?.();
      return;
    }

    const msg = JSON.parse(String(data));

    if (msg.type === "register") {
      if (msg.payload?.["client-key"]) {
        queueMicrotask(() => {
          this.emit(
            "message",
            Buffer.from(JSON.stringify({ id: "0", type: "registered" }))
          );
        });
      } else if (msg.payload?.pairingType === "PIN") {
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
    } else if (msg.type === "request") {
      let payload: Record<string, unknown> = { returnValue: true };

      if (msg.uri === "ssap://pairing/setPin") {
        queueMicrotask(() => {
          this.emit(
            "message",
            Buffer.from(
              JSON.stringify({
                id: msg.id,
                type: "registered",
                payload: { clientKey: `pin-key-${msg.payload?.pin}` },
              })
            )
          );
          if (msg.payload?.pin === "close-after-key") {
            queueMicrotask(() => this.emit("close"));
          }
          if (msg.payload?.pin === "error-after-key") {
            queueMicrotask(() => this.emit("error", new Error("late error")));
          }
        });
        return;
      }

      if (msg.uri === "ssap://system/getSystemInfo") {
        payload = {
          returnValue: true,
          modelName: "OLED55C1PUB",
          sdkVersion: "6.0.0",
          firmwareVersion: "03.20.80",
        };
      } else if (msg.uri === "ssap://tv/getCurrentExternalInput") {
        payload = { returnValue: true, inputId: "HDMI_1" };
      } else if (msg.uri === "ssap://com.webos.applicationManager/getForegroundAppInfo") {
        payload = { returnValue: true, appId: "com.webos.app.hdmi1" };
      } else if (msg.uri === "ssap://audio/getVolume") {
        payload = { returnValue: true, volume: 42 };
      } else if (msg.uri === "ssap://audio/getMute") {
        payload = { returnValue: true, mute: false };
      } else if (msg.uri === "ssap://com.webos.settingsservice/getSystemSettings") {
        payload = { returnValue: true, settings: { brightness: 75 } };
      } else if (msg.uri === "ssap://config/getConfigs") {
        payload = { returnValue: true, configs: { "com.palm.brightness": 75 } };
      } else if (msg.uri === "ssap://com.webos.service.networkinput/getPointerInputSocket") {
        payload = {
          returnValue: true,
          socketPath: pointerSocketPath,
        };
      }

      queueMicrotask(() => {
        this.emit(
          "message",
          Buffer.from(
            JSON.stringify({
              id: msg.id,
              type: "response",
              payload,
            })
          )
        );
      });
    }
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    queueMicrotask(() => this.emit("close"));
  }
}

mock.module("ws", () => {
  return { default: MockWebSocket };
});

const { ConnectionManager } = await import("./connection.ts");
const { pair, beginPinPairing, connect, forgetCredentials } = await import("./index.ts");

describe("ConnectionManager", () => {
  test("connects and registers with clientKey", async () => {
    const conn = new ConnectionManager("192.168.1.100", "existing-key");
    await conn.connect();
    expect(conn.connected).toBeTrue();
    await conn.disconnect();
  });

  test("send returns response payload", async () => {
    const conn = new ConnectionManager("192.168.1.100", "key");
    const result = (await conn.send(
      "ssap://system/getSystemInfo"
    )) as Record<string, unknown>;
    expect(result.returnValue).toBeTrue();
    expect(result.modelName).toBe("OLED55C1PUB");
    await conn.disconnect();
  });

  test("disconnect prevents reconnection", async () => {
    const conn = new ConnectionManager("192.168.1.100", "key", 3, 100);
    await conn.connect();
    expect(conn.connected).toBeTrue();
    await conn.disconnect();
    expect(conn.connected).toBeFalse();
  });

  test("multiple sends get correct ids", async () => {
    const conn = new ConnectionManager("192.168.1.100", "key");
    const p1 = conn.send("ssap://audio/getVolume");
    const p2 = conn.send("ssap://tv/getCurrentExternalInput");
    const [r1, r2] = await Promise.all([p1, p2]);
    expect((r1 as Record<string, unknown>).volume).toBe(42);
    expect((r2 as Record<string, unknown>).inputId).toBe("HDMI_1");
    await conn.disconnect();
  });
});

describe("public API", () => {
  test("pair stores clientKey", async () => {
    const path = join(tmpDir, "creds.json");
    await pair({ host: "192.168.1.100", credentialsPath: path });
    const key = await getClientKey("192.168.1.100", path);
    expect(key).toBe("mock-client-key");
  });

  test("pair throws if already paired", async () => {
    const path = join(tmpDir, "creds.json");
    await pair({ host: "192.168.1.100", credentialsPath: path });
    await expect(
      pair({ host: "192.168.1.100", credentialsPath: path })
    ).rejects.toThrow("Already paired");
  });

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

  test("pair with PIN submits supplied code and stores clientKey", async () => {
    const path = join(tmpDir, "creds.json");
    await pair({
      host: "192.168.1.100",
      credentialsPath: path,
      pairingType: "PIN",
      pin: "654321",
    });

    expect(await getClientKey("192.168.1.100", path)).toBe("pin-key-654321");
  });

  test("pair with PIN cancels session when pin callback rejects", async () => {
    MockWebSocket.instances = [];
    const path = join(tmpDir, "creds.json");

    await expect(
      pair({
        host: "192.168.1.100",
        credentialsPath: path,
        pairingType: "PIN",
        pin: () => Promise.reject(new Error("pin unavailable")),
      })
    ).rejects.toThrow("pin unavailable");

    expect(MockWebSocket.instances[0]?.readyState).toBe(MockWebSocket.CLOSED);
  });

  test("submitPin ignores close after receiving clientKey", async () => {
    const path = join(tmpDir, "creds.json");
    const session = await beginPinPairing({
      host: "192.168.1.100",
      credentialsPath: path,
    });

    await expect(session.submitPin("close-after-key")).resolves.toBeUndefined();
    expect(await getClientKey("192.168.1.100", path)).toBe(
      "pin-key-close-after-key"
    );
  });

  test("submitPin ignores error after receiving clientKey", async () => {
    const path = join(tmpDir, "creds.json");
    const session = await beginPinPairing({
      host: "192.168.1.100",
      credentialsPath: path,
    });

    await expect(session.submitPin("error-after-key")).resolves.toBeUndefined();
    expect(await getClientKey("192.168.1.100", path)).toBe(
      "pin-key-error-after-key"
    );
  });

  test("connect returns client handle", async () => {
    const path = join(tmpDir, "creds.json");
    await setClientKey("192.168.1.100", "test-key", path);
    const tv = await connect({ host: "192.168.1.100", credentialsPath: path });
    expect(tv).toBeDefined();
    expect(typeof tv.setInput).toBe("function");
    await tv.disconnect();
  });

  test("connect throws if not paired", async () => {
    const path = join(tmpDir, "creds.json");
    await expect(
      connect({ host: "192.168.1.100", credentialsPath: path })
    ).rejects.toThrow("No credentials found");
  });

  test("forgetCredentials removes key", async () => {
    const path = join(tmpDir, "creds.json");
    await setClientKey("host-a", "key-a", path);
    await forgetCredentials({ host: "host-a", credentialsPath: path });
    expect(await getClientKey("host-a", path)).toBeUndefined();
  });
});

describe("WebOSClient methods", () => {
  test("setInput validates and sends", async () => {
    const path = join(tmpDir, "creds.json");
    await setClientKey("192.168.1.100", "test-key", path);
    const tv = await connect({ host: "192.168.1.100", credentialsPath: path });

    await tv.setInput("HDMI_1");
    await expect(tv.setInput("DP_1")).rejects.toThrow("Invalid input");

    await tv.disconnect();
  });

  test("getInput returns current input", async () => {
    const path = join(tmpDir, "creds.json");
    await setClientKey("192.168.1.100", "test-key", path);
    const tv = await connect({ host: "192.168.1.100", credentialsPath: path });
    const input = await tv.getInput();
    expect(input).toBe("HDMI_1");
    await tv.disconnect();
  });

  test("getVolume returns volume level", async () => {
    const path = join(tmpDir, "creds.json");
    await setClientKey("192.168.1.100", "test-key", path);
    const tv = await connect({ host: "192.168.1.100", credentialsPath: path });
    const vol = await tv.getVolume();
    expect(vol).toBe(42);
    await tv.disconnect();
  });

  test("getBrightness returns brightness level", async () => {
    const path = join(tmpDir, "creds.json");
    await setClientKey("192.168.1.100", "test-key", path);
    const tv = await connect({ host: "192.168.1.100", credentialsPath: path });
    const brightness = await tv.getBrightness();
    expect(brightness).toBe(75);
    await tv.disconnect();
  });

  test("sendRemoteButton sends a button command over pointer socket", async () => {
    const path = join(tmpDir, "creds.json");
    await setClientKey("192.168.1.100", "test-key", path);
    const tv = await connect({ host: "192.168.1.100", credentialsPath: path });

    await tv.sendRemoteButton("MENU" as any);

    expect(pointerSocketMessages).toContain("type:button\nname:MENU\n\n");
    await tv.disconnect();
  });

  test("sendRemoteButton rejects pointer socket URLs for other hosts", async () => {
    const path = join(tmpDir, "creds.json");
    pointerSocketPath = "wss://192.168.1.200:3001/resources/mock/netinput.pointer.sock";
    await setClientKey("192.168.1.100", "test-key", path);
    const tv = await connect({ host: "192.168.1.100", credentialsPath: path });

    await expect(tv.sendRemoteButton("MENU")).rejects.toThrow("Invalid pointer input socket URL");

    await tv.disconnect();
  });

  test("sendRemoteButton times out when pointer socket never opens", async () => {
    const path = join(tmpDir, "creds.json");
    pointerSocketPath = "wss://192.168.1.100:3001/resources/mock/timeout.pointer.sock";
    process.env.MONITOR_KVM_POINTER_TIMEOUT_MS = "1";
    await setClientKey("192.168.1.100", "test-key", path);
    const tv = await connect({ host: "192.168.1.100", credentialsPath: path });

    await expect(tv.sendRemoteButton("MENU")).rejects.toThrow("Pointer input socket timed out");

    await tv.disconnect();
  });

  test("getSystemInfo returns model info", async () => {
    const path = join(tmpDir, "creds.json");
    await setClientKey("192.168.1.100", "test-key", path);
    const tv = await connect({ host: "192.168.1.100", credentialsPath: path });
    const info = await tv.getSystemInfo();
    expect(info.modelName).toBe("OLED55C1PUB");
    expect(info.sdkVersion).toBe("6.0.0");
    await tv.disconnect();
  });

  test("call sends generic request", async () => {
    const path = join(tmpDir, "creds.json");
    await setClientKey("192.168.1.100", "test-key", path);
    const tv = await connect({ host: "192.168.1.100", credentialsPath: path });
    const result = await tv.call("ssap://audio/getVolume");
    expect((result as Record<string, unknown>).volume).toBe(42);
    await tv.disconnect();
  });
});
