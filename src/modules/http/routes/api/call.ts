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
    if (err.message?.includes("No credentials found") || err.message?.includes("Call pair()")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "SSAP call failed" }, 500);
  }
});

export default call;
