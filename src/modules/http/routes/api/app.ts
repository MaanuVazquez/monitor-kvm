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
