import { Hono } from "hono";
import { devicePool } from "../../device-pool.ts";
import type { SetValueBody } from "../../types.ts";

const audio = new Hono();

audio.get("/:host/volume", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    const volume = await client.getVolume();
    let muted = false;
    try {
      const muteResult = (await client.call("ssap://audio/getMute")) as { mute?: boolean };
      muted = muteResult?.mute ?? false;
    } catch {
      // mute state is best-effort
    }
    return c.json({ volume, muted });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to get volume" }, 500);
  }
});

audio.post("/:host/volume", async (c) => {
  const host = c.req.param("host");
  const body = (await c.req.json()) as SetValueBody;

  if (typeof body.value !== "number" || body.value < 0 || body.value > 100) {
    return c.json({ error: "value must be a number between 0 and 100" }, 400);
  }

  try {
    const client = await devicePool.getClient(host);
    await client.setVolume(body.value);
    return c.json({ volume: body.value });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to set volume" }, 500);
  }
});

audio.post("/:host/volume/mute", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    await client.mute();
    return c.json({ muted: true });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to mute" }, 500);
  }
});

audio.delete("/:host/volume/mute", async (c) => {
  const host = c.req.param("host");

  try {
    const client = await devicePool.getClient(host);
    await client.unmute();
    return c.json({ muted: false });
  } catch (err: any) {
    if (err.message === "Device not connected" || err.message?.includes("Not paired")) {
      return c.json({ error: "Device not paired" }, 404);
    }
    return c.json({ error: err.message ?? "Failed to unmute" }, 500);
  }
});

export default audio;
