import { Hono } from "hono";
import { reactRenderer } from "@hono/react-renderer";
import App from "../components/App.tsx";

const ui = new Hono();

ui.get(
  "*",
  reactRenderer(({ children }) => (
    <html>
      <body>{children}</body>
    </html>
  ))
);

ui.get("/", (c) => {
  return c.render(<App />);
});

export default ui;
