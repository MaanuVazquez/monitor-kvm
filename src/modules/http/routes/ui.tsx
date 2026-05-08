import { Hono } from "hono";
import { reactRenderer } from "@hono/react-renderer";
import App from "../components/App.tsx";
import { devicePool } from "../device-pool.ts";

const ui = new Hono();

ui.get(
  "*",
  reactRenderer(({ children }) => (
    <html>
      <body>{children}</body>
    </html>
  ))
);

ui.get("/", async (c) => {
  const devices = await devicePool.getAllDevices();
  return c.render(<App devices={devices} />);
});

export default ui;
