import { Hono } from "hono";
import { apiKeyMiddleware } from "../middlewares/api-key.ts";

const api = new Hono();

api.use("*", apiKeyMiddleware);

api.get("/", (c) => {
  return c.json({ status: "ok" });
});

export default api;
