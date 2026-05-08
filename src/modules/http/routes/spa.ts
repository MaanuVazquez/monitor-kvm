import { Hono } from "hono";

const spa = new Hono();

const html = await Bun.file("./src/modules/http/index.html").text();

spa.get("*", (c) => {
  return c.html(html);
});

export default spa;
