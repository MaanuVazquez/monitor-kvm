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
