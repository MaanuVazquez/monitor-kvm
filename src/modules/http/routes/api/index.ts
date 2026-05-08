import { Hono } from "hono";
import { apiKeyMiddleware } from "../../middlewares/api-key.ts";
import { corsMiddleware, corsPreflight } from "../../middlewares/cors.ts";
import deviceRoutes from "./device.ts";
import inputRoutes from "./input.ts";
import displayRoutes from "./display.ts";
import audioRoutes from "./audio.ts";
import appRoutes from "./app.ts";
import callRoutes from "./call.ts";
import servicesRoutes from "./services.ts";
import rootRoutes from "./root.ts";

const api = new Hono();

// corsMiddleware MUST come before corsPreflight so OPTIONS responses include CORS headers
api.use("*", corsMiddleware);
api.use("*", corsPreflight());
api.use("*", apiKeyMiddleware);

api.route("/", rootRoutes);
api.route("/devices", deviceRoutes);
api.route("/devices", inputRoutes);
api.route("/devices", displayRoutes);
api.route("/devices", audioRoutes);
api.route("/devices", appRoutes);
api.route("/devices", callRoutes);
api.route("/devices", servicesRoutes);

export default api;
