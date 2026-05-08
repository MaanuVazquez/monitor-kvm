import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import api from "./routes/api/index.ts";
import spa from "./routes/spa.ts";

const app = new Hono();

// API routes first
app.route("/api", api);

// Static assets
app.use("/client.js", serveStatic({ path: "./public/client.js" }));
app.use("/styles.css", serveStatic({ path: "./public/styles.css" }));

// SPA catch-all — must be last
app.route("/", spa);

export default app;
