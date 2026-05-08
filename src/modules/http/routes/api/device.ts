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
