import { createMiddleware } from "hono/factory";

export const apiKeyMiddleware = createMiddleware(async (c, next) => {
  const key = process.env.API_KEY;
  if (!key) {
    return c.json({ error: "API_KEY not configured on server" }, 401);
  }
  const provided = c.req.header("x-api-key");
  if (!provided || provided !== key) {
    return c.json({ error: "invalid api key" }, 401);
  }
  await next();
});
