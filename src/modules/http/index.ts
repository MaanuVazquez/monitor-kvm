import { Hono } from "hono";
import ui from "./routes/ui.tsx";
import api from "./routes/api/index.ts";

const app = new Hono();

app.route("/", ui);
app.route("/api", api);

export default app;
