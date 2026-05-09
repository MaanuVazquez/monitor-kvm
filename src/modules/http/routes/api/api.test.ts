import { describe, it, expect, mock, beforeEach, beforeAll } from "bun:test";
import { Hono } from "hono";

let startPinPairingImpl: (host: string) => void | Promise<void>;
let submitPinPairingImpl: (host: string, pin: string) => void | Promise<void>;

const startPinPairingMock = mock((host: string) => startPinPairingImpl(host));
const submitPinPairingMock = mock((host: string, pin: string) => submitPinPairingImpl(host, pin));
const cancelPinPairingMock = mock((_host: string) => {});
const sendRemoteButtonMock = mock((_button: string) => {});

mock.module("../../device-pool.ts", () => ({
  devicePool: {
    getAllDevices: mock(() => [
      { host: "192.168.1.100", connected: true, paired: true, pairedAt: "2026-01-01T00:00:00Z" },
    ]),
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
          getServiceList: mock(() => ["ssap://system/getSystemInfo", "ssap://audio/getVolume"]),
          launchApp: mock((_appId: string, _params?: Record<string, unknown>) => {}),
          sendRemoteButton: sendRemoteButtonMock,
          call: mock((_uri: string, _payload?: Record<string, unknown>) => ({ ok: true })),
          disconnect: mock(() => {}),
        };
      }
      if (host === "192.168.1.200") {
        throw Object.assign(new Error("No credentials found for 192.168.1.200. Call pair() first."));
      }
      throw new Error("Unknown host");
    }),
    pairDevice: mock((_host: string, _opts: any) => {}),
    startPinPairing: startPinPairingMock,
    submitPinPairing: submitPinPairingMock,
    cancelPinPairing: cancelPinPairingMock,
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
}));

let api: any;

beforeAll(async () => {
  const mod = await import("./index.ts");
  api = mod.default;
});

function createApp() {
  const app = new Hono();
  app.route("/api", api);
  return app;
}

function apiKey() {
  return "test-key";
}

function apiHeaders(extra?: Record<string, string>) {
  return { "x-api-key": apiKey(), ...(extra ?? {}) };
}

describe("API routes", () => {
  beforeEach(() => {
    process.env.API_KEY = apiKey();
    startPinPairingImpl = (_host: string) => {};
    submitPinPairingImpl = (_host: string, _pin: string) => {};
    startPinPairingMock.mockClear();
    submitPinPairingMock.mockClear();
    cancelPinPairingMock.mockClear();
    sendRemoteButtonMock.mockClear();
  });

  describe("GET /api", () => {
    it("returns summary with x-api-key header", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api", { headers: apiHeaders() });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
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

  describe("CORS preflight", () => {
    it("returns 204 for OPTIONS without API key", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices", {
        method: "OPTIONS",
        headers: { Origin: "http://example.com" },
      });
      const res = await app.request(req);
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://example.com");
    });
  });

  describe("GET /api/devices", () => {
    it("returns device list", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices", { headers: apiHeaders() });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body).toBeArray();
      expect(body[0].host).toBe("192.168.1.100");
      expect(body[0].connected).toBe(true);
    });
  });

  describe("GET /api/devices/:host/status", () => {
    it("returns device status", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/status", {
        headers: apiHeaders(),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.host).toBe("192.168.1.100");
      expect(body.connected).toBe(true);
      expect(body.modelName).toBe("TestMonitor");
    });
  });

  describe("GET /api/devices/:host/input", () => {
    it("returns current input", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/input", {
        headers: apiHeaders(),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.input).toBe("HDMI_1");
    });
  });

  describe("POST /api/devices/:host/input", () => {
    it("sets input", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/input", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ input: "HDMI_2" }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.input).toBe("HDMI_2");
    });

    it("rejects missing input", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/input", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
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
        headers: apiHeaders(),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.brightness).toBe(50);
    });
  });

  describe("POST /api/devices/:host/brightness", () => {
    it("sets brightness", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/brightness", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ value: 75 }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.brightness).toBe(75);
    });

    it("rejects out-of-range brightness", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/brightness", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ value: 150 }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(400);
    });

    it("rejects non-number brightness", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/brightness", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ value: "bright" }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/devices/:host/remote/button", () => {
    it("sends a remote button", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/remote/button", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ button: "MENU" }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body).toEqual({ button: "MENU" });
      expect(sendRemoteButtonMock).toHaveBeenCalledWith("MENU");
    });

    it("rejects invalid remote buttons", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/remote/button", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ button: "POWER" }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(400);
      expect(sendRemoteButtonMock).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/devices/:host/volume", () => {
    it("returns volume and mute state", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/volume", {
        headers: apiHeaders(),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.volume).toBe(15);
      expect(body.muted).toBe(false);
    });
  });

  describe("POST /api/devices/:host/volume", () => {
    it("sets volume", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/volume", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ value: 30 }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.volume).toBe(30);
    });

    it("rejects out-of-range volume", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/volume", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ value: 200 }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/devices/:host/volume/mute", () => {
    it("mutes", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/volume/mute", {
        method: "POST",
        headers: apiHeaders(),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.muted).toBe(true);
    });
  });

  describe("DELETE /api/devices/:host/volume/mute", () => {
    it("unmutes", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/volume/mute", {
        method: "DELETE",
        headers: apiHeaders(),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.muted).toBe(false);
    });
  });

  describe("POST /api/devices/:host/power/off", () => {
    it("powers off", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/power/off", {
        method: "POST",
        headers: apiHeaders(),
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
        headers: apiHeaders(),
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
        headers: apiHeaders(),
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
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({}),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.launched).toBe(true);
      expect(body.appId).toBe("com.webos.app.hdmi1");
    });
  });

  describe("POST /api/devices/:host/call", () => {
    it("calls SSAP endpoint", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/call", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ uri: "ssap://system/getSystemInfo" }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.result).toEqual({ ok: true });
    });

    it("rejects missing uri", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/call", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({}),
      });
      const res = await app.request(req);
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/devices/:host/pair", () => {
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
      expect(startPinPairingMock).toHaveBeenCalledWith("192.168.1.100");
    });

    it("submits PIN pairing", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/pair/pin/submit", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ pin: " 123456 " }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body).toEqual({ paired: true, host: "192.168.1.100" });
      expect(submitPinPairingMock).toHaveBeenCalledWith("192.168.1.100", "123456");
    });

    it("cancels PIN pairing", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/pair/pin", {
        method: "DELETE",
        headers: apiHeaders(),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body).toEqual({ cancelled: true, host: "192.168.1.100" });
      expect(cancelPinPairingMock).toHaveBeenCalledWith("192.168.1.100");
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
      const body = await res.json() as any;
      expect(body).toEqual({ error: "pin is required" });
      expect(submitPinPairingMock).not.toHaveBeenCalled();
    });

    it("rejects null body as missing PIN on submit", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/pair/pin/submit", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(null),
      });
      const res = await app.request(req);
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body).toEqual({ error: "pin is required" });
      expect(submitPinPairingMock).not.toHaveBeenCalled();
    });

    it("rejects blank PIN on submit", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/pair/pin/submit", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ pin: "   " }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body).toEqual({ error: "pin is required" });
      expect(submitPinPairingMock).not.toHaveBeenCalled();
    });

    it("rejects non-string PIN on submit", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/pair/pin/submit", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ pin: 123456 }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body).toEqual({ error: "pin is required" });
      expect(submitPinPairingMock).not.toHaveBeenCalled();
    });

    it("rejects malformed PIN on submit", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/pair/pin/submit", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ pin: "12a456" }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body).toEqual({ error: "pin must contain only digits" });
      expect(submitPinPairingMock).not.toHaveBeenCalled();
    });

    it("returns conflict when no PIN pairing session is pending", async () => {
      submitPinPairingImpl = () => {
        throw new Error("No pending PIN pairing session. Start PIN pairing again.");
      };
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/pair/pin/submit", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ pin: "123456" }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(409);
      const body = await res.json() as any;
      expect(body).toEqual({ error: "No pending PIN pairing session. Start PIN pairing again." });
    });

    it("returns conflict when PIN pairing submission is already in progress", async () => {
      submitPinPairingImpl = () => {
        throw new Error("PIN pairing submission already in progress.");
      };
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/pair/pin/submit", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ pin: "123456" }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(409);
      const body = await res.json() as any;
      expect(body).toEqual({ error: "PIN pairing submission already in progress." });
    });

    it("returns server error for unexpected PIN pairing submit failures", async () => {
      submitPinPairingImpl = () => {
        throw new Error("Unexpected failure");
      };
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/pair/pin/submit", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ pin: "123456" }),
      });
      const res = await app.request(req);
      expect(res.status).toBe(500);
      const body = await res.json() as any;
      expect(body).toEqual({ error: "Unexpected failure" });
    });

    it("pairs a device", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/pair", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
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
        headers: apiHeaders(),
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
        headers: apiHeaders(),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/devices/:host/services", () => {
    it("returns service list", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.100/services", {
        headers: apiHeaders(),
      });
      const res = await app.request(req);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.services).toBeArray();
      expect(body.services[0]).toBe("ssap://system/getSystemInfo");
    });
  });

  describe("404 for unpaired device", () => {
    it("returns 404 when device has no credentials", async () => {
      const app = createApp();
      const req = new Request("http://localhost/api/devices/192.168.1.200/input", {
        headers: apiHeaders(),
      });
      const res = await app.request(req);
      expect(res.status).toBe(404);
      const body = await res.json() as any;
      expect(body.error).toBe("Device not paired");
    });
  });
});
