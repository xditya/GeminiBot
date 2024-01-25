/*
 * Copyright 2024 @xditya <https://xditya.me/github>
 * Redistribution and use in source and binary forms, with or without modification, are permitted
 * provided the copyright header is included and attributes are preserved.
 */

import { Bot, GrammyError, HttpError, InlineKeyboard } from "grammy/mod.ts";

import config from "$env";
import { addUser } from "./db.ts";
import { getResponse, getModelInfo } from "./gemini.ts";

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
  const member = await bot.api.getChatMember("@BotzHub", user);
  return (
    member.status == "member" ||
    member.status == "creator" ||
    member.status == "administrator"
  );
}

bot.chatType("private").command("start", async (ctx) => {
  if (!(await checkJoin(ctx.from!.id))) {
    await ctx.reply(
      `Hey ${ctx.from!.first_name}, you must join @BotzHub to use this bot!`,
      {
        reply_markup: new InlineKeyboard().url(
          "Join Now!",
          "https://t.me/BotzHub"
        ),
      }
    );
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
        .text("✋ Help", "help_menu")
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
      .text("✋ Help", "help_menu")
      .url("🔄 Updates", "https://t.me/BotzHub")
      .row()
      .text("ℹ️ Information", "info"),
    parse_mode: "HTML",
  });
});

bot.callbackQuery("help_menu", async (ctx) => {
  await ctx.editMessageCaption({
    caption: `
<b>Help Menu</b>

Send a message, and the AI will reply to it within seconds. 🤖💬
`,
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
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

bot.on("message:text", async (ctx) => {
  if (!(await checkJoin(ctx.from!.id))) {
    await ctx.react("👾");
    await ctx.reply(
      `Hey ${ctx.from!.first_name}, you must join @BotzHub to use this bot!`,
      {
        reply_markup: new InlineKeyboard().url(
          "Join Now!",
          "https://t.me/BotzHub"
        ),
      }
    );
    return;
  }
  await ctx.react("⚡");
  await ctx.api.sendChatAction(ctx.chat!.id, "typing");
  const text = ctx.message!.text;
  const response = await getResponse(ctx.from!.id, text);
  if (response.length > 4096) {
    const splitMsg = response.match(/[\s\S]{1,4096}/g) || [];
    for (const msg of splitMsg) {
      try {
        await ctx.reply(msg, {
          parse_mode: "Markdown",
        });
      } catch (err) {
        await ctx.reply(`<blockquote>${msg}</blockquote>`, {
          parse_mode: "HTML",
        });
      }
    }
  } else {
    try {
      await ctx.reply(response, {
        parse_mode: "Markdown",
      });
    } catch (err) {
      await ctx.reply(`<blockquote>${response}</blockquote>`, {
        parse_mode: "HTML",
      });
    }
  }
});

await bot.init();
export default bot;
