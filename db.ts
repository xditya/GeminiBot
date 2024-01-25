/*
 * Copyright 2024 @xditya <https://xditya.me/github>
 * Redistribution and use in source and binary forms, with or without modification, are permitted
 * provided the copyright header is included and attributes are preserved.
 */

import { MongoClient, ObjectId } from "mongo";

import config from "$env";

console.log("Connecting to MongoDB...");
const client = new MongoClient();
const MONGO_URL = new URL(config.MONGO_URL);
if (!MONGO_URL.searchParams.has("authMechanism")) {
  MONGO_URL.searchParams.set("authMechanism", "SCRAM-SHA-1");
}
try {
  await client.connect(MONGO_URL.href);
} catch (err) {
  console.error("Error connecting to MongoDB", err);
  throw err;
}
const db = client.database("GeminiBot");

interface ConversationPart {
  text: string;
}

interface UserDataSchema {
  _id: ObjectId;
  user_id: number;
  conversation_history: Array<Map<string, ConversationPart[]>>;
}

const userDb = db.collection<UserDataSchema>("UserData");

async function addUser(id: number) {
  const data = await userDb.findOne({ user_id: id });
  if (data) return;
  await userDb.insertOne({
    user_id: id,
    conversation_history: new Array<Map<string, ConversationPart[]>>(),
  });
}

async function addConversation(
  id: number,
  conv: Array<Map<string, ConversationPart[]>>
) {
  const oldData = await userDb.findOne({ user_id: id });
  if (!oldData) {
    await userDb.insertOne({
      user_id: id,
      conversation_history: conv,
    });
  } else {
    const new_conv = oldData.conversation_history.concat(conv);
    await userDb.updateOne(
      { user_id: id },
      { $set: { conversation_history: new_conv } }
    );
  }
}

async function resetConversation(
  id: number,
  conv: Array<Map<string, ConversationPart[]>>
) {
  await userDb.updateOne(
    { user_id: id },
    { $set: { conversation_history: conv } }
  );
}

async function getConversations(id: number) {
  const data = await userDb.findOne({ user_id: id });
  if (!data) return Array<Map<string, ConversationPart[]>>();
  return data.conversation_history;
}

export {
  type ConversationPart,
  addUser,
  addConversation,
  getConversations,
  resetConversation,
};
