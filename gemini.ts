/*
 * Copyright 2024 @xditya <https://xditya.me/github>
 * Redistribution and use in source and binary forms, with or without modification, are permitted
 * provided the copyright header is included and attributes are preserved.
 */

import OpenAI from "https://deno.land/x/openai@v4.69.0/mod.ts";
import config from "$env";
import {
  addConversation,
  type ConversationPart,
  getConversations,
  resetConversation,
} from "./db.ts";

const client = new OpenAI({
  apiKey: config.DEFAULT_API_KEY,
  baseURL: "https://api.z.ai/api/paas/v4/",
});

const SYSTEM_PROMPT = `You are **Gemini Talk Bot**, a friendly and helpful AI assistant developed by [Aditya](https://xditya.me) for [@BotzHub](https://t.me/BotzHub).

## Identity & Disclosure
- If asked who you are, introduce yourself as: *"Gemini Talk Bot, an AI assistant developed by [Aditya](https://xditya.me) for [@BotzHub](https://t.me/BotzHub)."*
- If asked what model you are based on, say **Gemini 2.5 Flash** — nothing more.
- Do not reveal any underlying model details beyond what is stated above.
- Always include markdown links to both [Aditya](https://xditya.me) and [@BotzHub](https://t.me/BotzHub) when referencing them.

## Behavior Guidelines
- Always respond in a **friendly, helpful, and approachable** tone.
- Provide **accurate and relevant** information. If you're unsure, say so honestly — but offer guidance or next steps where possible.
- Only share detailed information about your origin or developer **if the user explicitly asks**.
- Keep responses concise unless the user requests elaboration.

## Telegram HTML Formatting (Required)
- Responses are rendered in Telegram with parse_mode set to "HTML".
- Always format output using Telegram-supported HTML only.
- Allowed tags: <b>, <i>, <u>, <s>, <code>, <pre>, <a href="...">, <blockquote>.
- Do not use Markdown syntax like **bold**, *italic*, backticks, or markdown links.
- Keep HTML valid and properly closed.

## Telegram HTML Examples
- Simple: <b>Answer:</b> This is a short response.
- Link: Visit <a href="https://t.me/BotzHub">@BotzHub</a> for updates.
- Code: <pre><code>const x = 42;</code></pre>
- Quote: <blockquote>This is an important note.</blockquote>`;

type StoredConversation =
  | Map<string, unknown>
  | { role?: unknown; parts?: unknown };

function normalizeConversation(conv: StoredConversation): {
  role?: string;
  parts: ConversationPart[];
} {
  if (conv instanceof Map) {
    const role = conv.get("role");
    const parts = conv.get("parts");
    return {
      role: typeof role === "string" ? role : undefined,
      parts: Array.isArray(parts) ? (parts as ConversationPart[]) : [],
    };
  }

  const role = conv?.role;
  const parts = conv?.parts;
  return {
    role: typeof role === "string" ? role : undefined,
    parts: Array.isArray(parts) ? (parts as ConversationPart[]) : [],
  };
}

async function getResponse(
  user_id: number,
  question: string,
  onStream?: (text: string) => Promise<void>,
) {
  const requestStartedAt = Date.now();
  console.log(
    `[getResponse] start user=${user_id} questionChars=${question.length}`,
  );

  const conversationHistory = await getConversations(user_id);
  console.log(
    `[getResponse] history-loaded user=${user_id} historyItems=${conversationHistory.length} elapsedMs=${Date.now() - requestStartedAt}`,
  );

  await checkAndClearOldConversations(user_id, conversationHistory);
  console.log(
    `[getResponse] history-trim-checked user=${user_id} elapsedMs=${Date.now() - requestStartedAt}`,
  );

  // Convert conversation history to OpenAI format
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  // Add conversation history
  for (const conv of conversationHistory as StoredConversation[]) {
    const { role, parts } = normalizeConversation(conv);

    if (role && parts.length > 0) {
      const content = parts
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n");

      if (!content) continue;

      if (role === "user") {
        messages.push({ role: "user", content });
      } else if (role === "model") {
        messages.push({ role: "assistant", content });
      }
    }
  }

  // Add current question
  messages.push({ role: "user", content: question });

  try {
    const streamRequestAt = Date.now();
    console.log(
      `[getResponse] stream-request user=${user_id} messages=${messages.length}`,
    );

    // Stream the response
    const stream = await client.chat.completions.create({
      model: "GLM-4.5-Flash",
      messages: messages,
      stream: true,
    });
    console.log(
      `[getResponse] stream-open user=${user_id} openMs=${Date.now() - streamRequestAt} totalElapsedMs=${Date.now() - requestStartedAt}`,
    );

    let fullResponse = "";
    let chunkCount = 0;
    let firstChunkAt: number | null = null;

    // Process the stream
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        chunkCount++;
        if (firstChunkAt === null) {
          firstChunkAt = Date.now();
          console.log(
            `[getResponse] first-token user=${user_id} ttfbMs=${firstChunkAt - streamRequestAt} totalElapsedMs=${firstChunkAt - requestStartedAt}`,
          );
        }

        fullResponse += content;

        if (chunkCount % 40 === 0) {
          console.log(
            `[getResponse] streaming user=${user_id} chunks=${chunkCount} chars=${fullResponse.length} elapsedMs=${Date.now() - requestStartedAt}`,
          );
        }

        // Call the streaming callback if provided
        if (onStream) {
          await onStream(fullResponse);
        }
      }
    }
    console.log(
      `[getResponse] stream-complete user=${user_id} chunks=${chunkCount} chars=${fullResponse.length} elapsedMs=${Date.now() - requestStartedAt}`,
    );

    // Save conversation to database
    const convArray = new Array<Map<string, ConversationPart[]>>();

    const userConv = new Map<string, ConversationPart[]>();
    userConv.set("role", "user" as unknown as ConversationPart[]);
    userConv.set("parts", [{ text: question }] as ConversationPart[]);
    convArray.push(userConv);

    const modelConv = new Map<string, ConversationPart[]>();
    modelConv.set("role", "model" as unknown as ConversationPart[]);
    modelConv.set("parts", [{ text: fullResponse }] as ConversationPart[]);
    convArray.push(modelConv);

    const dbSaveAt = Date.now();
    await addConversation(user_id, convArray);
    console.log(
      `[getResponse] db-saved user=${user_id} dbMs=${Date.now() - dbSaveAt} totalElapsedMs=${Date.now() - requestStartedAt}`,
    );

    return fullResponse.replaceAll("* ", "→ ");
  } catch (err) {
    console.error(
      `[getResponse] error user=${user_id} elapsedMs=${Date.now() - requestStartedAt}`,
      err,
    );
    return "Sorry, I'm having trouble understanding you. Could you please rephrase your question?";
  }
}

async function checkAndClearOldConversations(
  id: number,
  conversationHistory: Array<Map<string, ConversationPart[]>>,
) {
  // this function keeps removing the first 2 elements of the array until the total conversations length is less than 50
  if (conversationHistory.length > 50) {
    conversationHistory.shift();
    conversationHistory.shift();
    await resetConversation(id, conversationHistory);
  }
}

function getModelInfo() {
  return `
<b>Model Name:</b> <blockquote>GLM-4.5-Flash (via Z.AI API)</blockquote>
<b>Description:</b> <blockquote>Fast and efficient AI model with streaming capabilities for real-time responses</blockquote>
<b>Features:</b> <blockquote>• Conversation history (last 50 exchanges)
• Real-time streaming responses
• Context-aware conversations</blockquote>

<b>Bot developed and hosted by @BotzHub.</b>
`;
}

export { getModelInfo, getResponse };
