import { createMiddleware } from "hono/factory";

export const corsMiddleware = createMiddleware(async (c, next) => {
  const origin = process.env.ALLOWED_ORIGINS ?? "*";
  const origins = origin.split(",").map((s) => s.trim());

  await next();

  const requestOrigin = c.req.header("origin");
  if (requestOrigin && (origins.includes("*") || origins.includes(requestOrigin))) {
    c.res.headers.set("Access-Control-Allow-Origin", requestOrigin);
  } else if (origins.includes("*")) {
    c.res.headers.set("Access-Control-Allow-Origin", "*");
  }

  c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  c.res.headers.set("Access-Control-Max-Age", "86400");
});

export function corsPreflight() {
  return createMiddleware(async (c, next) => {
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }
    await next();
  });
}
