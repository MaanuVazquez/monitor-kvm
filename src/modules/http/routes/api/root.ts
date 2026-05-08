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
