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
