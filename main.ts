import { webhookCallback } from "grammy/mod.ts";

import bot from "./bot.ts";

if (Deno.args[0] == "--polling") {
  console.info(`Started as @${bot.botInfo.username} on long polling.`);

  bot.start();
  Deno.addSignalListener("SIGINT", () => bot.stop());
  Deno.addSignalListener(
    Deno.build.os != "windows" ? "SIGTERM" : "SIGINT",
    () => bot.stop(),
  );
} else {
  console.info(`Started as @${bot.botInfo.username} on webhooks.`);

  const handleUpdate = webhookCallback(bot, "std/http");
  Deno.serve(async (req) => {
    if (req.method === "POST") {
      const url = new URL(req.url);
      if (url.pathname.slice(1) === bot.token) {
        try {
          return await handleUpdate(req);
        } catch (err) {
          console.error(err);
        }
      }
    }
    return new Response("Welcome!");
  });
}
