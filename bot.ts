/*
 * Copyright 2024 @xditya <https://xditya.me/github>
 * Redistribution and use in source and binary forms, with or without modification, are permitted
 * provided the copyright header is included and attributes are preserved.
 */

import { Bot, GrammyError, HttpError, InlineKeyboard } from "grammy/mod.ts";

import config from "$env";
import {
  addUser,
  getStats,
  getUserReactionSettings,
  toggelReactionSettings,
} from "./db.ts";
import { getModelInfo, getResponse } from "./gemini.ts";

const bot = new Bot(config.BOT_TOKEN);

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

async function checkJoin(user: number) {
  try {
    const member = await bot.api.getChatMember("@BotzHub", user);
    return (
      member.status == "member" ||
      member.status == "creator" ||
      member.status == "administrator"
    );
  } catch (err) {
    return false;
  }
}

bot.chatType("private").command("start", async (ctx) => {
  if (ctx.match && ctx.match === "how_to_remove") {
    await ctx.reply(`Join @BotzHub to remove this button from bots replies.`, {
      reply_markup: new InlineKeyboard().url(
        "Join Now!",
        "https://t.me/BotzHub"
      ),
    });
    return;
  }

  await ctx.api.sendPhoto(
    ctx.chat!.id,
    "https://storage.googleapis.com/gweb-uniblog-publish-prod/images/final_keyword_header.width-1600.format-webp.webp",
    {
      caption: `Hey ${
        ctx.from!.first_name
      }, I'm an AI assistant powered by <a href='https://blog.google/technology/ai/google-gemini-ai/'>Gemini</a>!

<blockquote>I can act as a personal assistant, answering your questions and helping you with your day-to-day tasks. 😊</blockquote>

I can remember <b>your last 50 conversations</b>, making your experience with me more <i>personal and human-like</i>! 🤖💬
      `,
      reply_markup: new InlineKeyboard()
        .text("⚙️ Settings", "settings")
        .url("🔄 Updates", "https://t.me/BotzHub")
        .row()
        .text("ℹ️ Information", "info"),
      parse_mode: "HTML",
    }
  );
  await addUser(ctx.from!.id);
});

bot.callbackQuery("back", async (ctx) => {
  await ctx.editMessageCaption({
    caption: `Hey ${
      ctx.from!.first_name
    }, I'm an AI assistant powered by <a href='https://blog.google/technology/ai/google-gemini-ai/'>Gemini</a>!

<blockquote>I can act as a personal assistant, answering your questions and helping you with your day-to-day tasks. 😊</blockquote>

I can remember <b>your last 50 conversations</b>, making your experience with me more <i>personal and human-like</i>! 🤖💬
    `,
    reply_markup: new InlineKeyboard()
      .text("⚙️ Settings", "settings")
      .url("🔄 Updates", "https://t.me/BotzHub")
      .row()
      .text("ℹ️ Information", "info"),
    parse_mode: "HTML",
  });
});

bot.callbackQuery("settings", async (ctx) => {
  const reactionsSettings = await getUserReactionSettings(ctx.from!.id);
  const userReaction = reactionsSettings ? "✅" : "❌";
  const userReactionMsg = reactionsSettings
    ? "❌ Disable Reactions"
    : "✅ Enable Reactions";
  await ctx.editMessageCaption({
    caption: `
<b>Settings Menu</b>

<b>Reaction on message recieve</b>: ${userReaction}
`,
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text(userReactionMsg, "reaction_toggle")
      .url("Updates", "https://t.me/BotzHub")
      .row()
      .text("👈 Back", "back"),
  });
});

bot.callbackQuery("reaction_toggle", async (ctx) => {
  await toggelReactionSettings(ctx.from!.id);
  const reactionsSettings = await getUserReactionSettings(ctx.from!.id);
  const userReaction = reactionsSettings ? "✅" : "❌";
  const userReactionMsg = reactionsSettings
    ? "❌ Disable Reactions"
    : "✅ Enable Reactions";
  await ctx.editMessageCaption({
    caption: `
<b>Settings Menu</b>

<b>Reaction on message recieve</b>: ${userReaction}
`,
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text(userReactionMsg, "reaction_toggle")
      .url("Updates", "https://t.me/BotzHub")
      .row()
      .text("👈 Back", "back"),
  });
});

bot.callbackQuery("info", async (ctx) => {
  const resp = await getModelInfo();
  await ctx.editMessageCaption({
    caption: resp,
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .url("Updates", "https://t.me/BotzHub")
      .row()
      .text("👈 Back", "back"),
  });
});

const owners: number[] = [];
for (const owner of config.OWNERS.split(" ")) {
  owners.push(parseInt(owner));
}

bot
  .filter((ctx) => owners.includes(ctx.from?.id || 0))
  .command("stats", async (ctx) => {
    await ctx.reply(`Total users: ${await getStats()}`);
  });

bot.chatType("private").on("message:text", async (ctx) => {
  if (await getUserReactionSettings(ctx.from!.id)) {
    await ctx.react("⚡");
  }
  await ctx.api.sendChatAction(ctx.chat!.id, "typing");
  const text = ctx.message!.text;
  const response = await getResponse(ctx.from!.id, text);
  let buttons = new InlineKeyboard();
  if (!(await checkJoin(ctx.from!.id))) {
    buttons = buttons.url(
      "Join Now",
      `https://t.me/${bot.botInfo?.username}?start=how_to_remove`
    );
  }

  if (response.length > 4096) {
    const splitMsg = response.match(/[\s\S]{1,4096}/g) || [];
    for (const msg of splitMsg) {
      try {
        await ctx.reply(msg, {
          parse_mode: "Markdown",
          reply_markup: buttons,
        });
      } catch (err) {
        await ctx.reply(`<blockquote>${msg}</blockquote>`, {
          parse_mode: "HTML",
          reply_markup: buttons,
        });
      }
    }
  } else {
    try {
      await ctx.reply(response, {
        parse_mode: "Markdown",
        reply_markup: buttons,
      });
    } catch (err) {
      await ctx.reply(`<blockquote>${response}</blockquote>`, {
        parse_mode: "HTML",
        reply_markup: buttons,
      });
    }
  }
});

await bot.init();
export default bot;
