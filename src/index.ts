import app from "./modules/http/index.ts";

const port = parseInt(process.env.PORT || "3000");

export default {
  port,
  fetch: app.fetch,
};

if (Bun.main.endsWith("index.ts")) {
  console.log(`monitor-kvm listening on http://localhost:${port}`);
  Bun.serve({ port, fetch: app.fetch });
}
