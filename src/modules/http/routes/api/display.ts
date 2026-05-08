import { Hono } from "hono";
import { devicePool } from "../../device-pool.ts";
import type { SetValueBody } from "../../types.ts";

const display = new Hono();

display.get("/:host/brightness", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    const brightness = await client.getBrightness();
    return c.json({ brightness });
  } catch (err: any) {
    if (err.message?.includes("No credentials found") || err.message?.includes("Call pair()")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to get brightness" }, 500);
  }
});

display.post("/:host/brightness", async (c) => {
  const host = c.req.param("host");
  const body = (await c.req.json()) as SetValueBody;

  if (typeof body.value !== "number" || body.value < 0 || body.value > 100) {
    return c.json({ error: "value must be a number between 0 and 100" }, 400);
  }

  try {
    const client = await devicePool.getClient(host);
    await client.setBrightness(body.value);
    return c.json({ brightness: body.value });
  } catch (err: any) {
    if (err.message?.includes("No credentials found") || err.message?.includes("Call pair()")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to set brightness" }, 500);
  }
});

display.post("/:host/power/screen/off", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    await client.turnOffScreen();
    return c.json({ screen: "off" });
  } catch (err: any) {
    if (err.message?.includes("No credentials found") || err.message?.includes("Call pair()")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to turn off screen" }, 500);
  }
});

display.post("/:host/power/screen/on", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    await client.turnOnScreen();
    return c.json({ screen: "on" });
  } catch (err: any) {
    if (err.message?.includes("No credentials found") || err.message?.includes("Call pair()")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to turn on screen" }, 500);
  }
});

display.post("/:host/power/off", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    await client.powerOff();
    return c.json({ power: "off" });
  } catch (err: any) {
    if (err.message?.includes("No credentials found") || err.message?.includes("Call pair()")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to power off" }, 500);
  }
});

export default display;
