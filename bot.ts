/*
 * Copyright 2026 @xditya <https://xditya.me/github>
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
  } catch (_err) {
    return false;
  }
}

bot.chatType("private").command("start", async (ctx) => {
  if (ctx.match && ctx.match === "how_to_remove") {
    await ctx.reply(`Join @BotzHub to remove this button from bots replies.`, {
      reply_markup: new InlineKeyboard().url(
        "Join Now!",
        "https://t.me/BotzHub",
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
        .style("danger")
        .url("🔄 Updates", "https://t.me/BotzHub")
        .style("success")
        .row()
        .text("ℹ️ Information", "info")
        .style("primary"),
      parse_mode: "HTML",
    },
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
      .style("danger")
      .url("🔄 Updates", "https://t.me/BotzHub")
      .style("success")
      .row()
      .text("ℹ️ Information", "info")
      .style("primary"),
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

  let buttons = new InlineKeyboard();
  if (!(await checkJoin(ctx.from!.id))) {
    buttons = buttons.url(
      "Join Now",
      `https://t.me/${bot.botInfo?.username}?start=how_to_remove`,
    );
  }

  const draftId = Date.now();
  let firstTokenReceived = false;
  let requestFinished = false;
  const thinkingFrames = [
    "⏳ Thinking...",
    "⏳ Thinking......",
    "⏳ Thinking.........",
  ];

  await ctx.api.sendMessageDraft(ctx.chat!.id, draftId, thinkingFrames[0], {
    parse_mode: "HTML",
  });

  const thinkingAnimator = (async () => {
    let frameIndex = 0;
    while (!firstTokenReceived && !requestFinished) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      if (firstTokenReceived || requestFinished) break;
      frameIndex = (frameIndex + 1) % thinkingFrames.length;
      try {
        await ctx.api.sendMessageDraft(
          ctx.chat!.id,
          draftId,
          thinkingFrames[frameIndex],
          { parse_mode: "HTML" },
        );
      } catch {
        // Ignore transient draft update issues while waiting for first token.
      }
    }
  })();

  let lastUpdate = Date.now();
  let updateCount = 0;

  const response = await getResponse(ctx.from!.id, text, async (streamText) => {
    if (!firstTokenReceived) {
      firstTokenReceived = true;
    }

    // Update message with streaming text, but throttle updates to avoid rate limits
    const now = Date.now();
    updateCount++;

    // Update every 500ms or every 50 characters, whichever comes first
    if (now - lastUpdate > 500 || updateCount % 50 === 0) {
      lastUpdate = now;
      try {
        await ctx.api.sendMessageDraft(ctx.chat!.id, draftId, streamText, {
          parse_mode: "HTML",
        });
      } catch (err) {
        // Ignore rate limit or duplicate message errors
        if (
          err instanceof GrammyError &&
          !err.description.includes("message is not modified") &&
          !err.description.includes("Too Many Requests")
        ) {
          // Try plain text if HTML fails due to partial/invalid HTML while streaming
          try {
            await ctx.api.sendMessageDraft(ctx.chat!.id, draftId, streamText);
          } catch {
            // Silently ignore
          }
        }
      }
    }
  });

  requestFinished = true;
  await thinkingAnimator;

  // Send final response
  if (response.length > 4096) {
    const splitMsg = response.match(/[\s\S]{1,4096}/g) || [];
    for (const msg of splitMsg) {
      try {
        await ctx.api.sendMessage(ctx.chat!.id, msg, {
          parse_mode: "HTML",
          reply_markup: buttons,
          link_preview_options: { is_disabled: true },
        });
      } catch (_err) {
        await ctx.api.sendMessage(ctx.chat!.id, msg, {
          reply_markup: buttons,
          link_preview_options: { is_disabled: true },
        });
      }
    }
  } else {
    try {
      await ctx.api.sendMessage(ctx.chat!.id, response, {
        parse_mode: "HTML",
        reply_markup: buttons,
        link_preview_options: { is_disabled: true },
      });
    } catch (_err) {
      try {
        await ctx.api.sendMessage(ctx.chat!.id, response, {
          reply_markup: buttons,
          link_preview_options: { is_disabled: true },
        });
      } catch {
        // If all fails, send a new message
        await ctx.api.sendMessage(ctx.chat!.id, response, {
          reply_markup: buttons,
          link_preview_options: { is_disabled: true },
        });
      }
    }
  }
});

await bot.init();
export default bot;
