import { db } from "../db.js";

const MAX_SUMMARY_CHARS = 1800;

export const upsertThreadState = async (input: {
  threadId: string;
  guildId: string;
  ownerUserId: string;
  summary?: string | null;
}) => {
  return db.threadState.upsert({
    where: { thread_id: input.threadId },
    create: {
      thread_id: input.threadId,
      guild_id: input.guildId,
      owner_user_id: input.ownerUserId,
      summary: input.summary ?? null
    },
    update: {
      owner_user_id: input.ownerUserId,
      summary: input.summary ?? undefined
    }
  });
};

export const getThreadState = async (threadId: string) => {
  return db.threadState.findUnique({ where: { thread_id: threadId } });
};

export const appendThreadSummary = async (input: {
  threadId: string;
  guildId: string;
  ownerUserId: string;
  append: string;
}) => {
  const existing = await db.threadState.findUnique({ where: { thread_id: input.threadId } });
  const current = (existing?.summary ?? "").trim();
  const next = [current, input.append.trim()].filter((part) => part.length > 0).join("\n");
  const trimmed = next.length > MAX_SUMMARY_CHARS ? next.slice(next.length - MAX_SUMMARY_CHARS) : next;

  return db.threadState.upsert({
    where: { thread_id: input.threadId },
    create: {
      thread_id: input.threadId,
      guild_id: input.guildId,
      owner_user_id: input.ownerUserId,
      summary: trimmed
    },
    update: {
      summary: trimmed
    }
  });
};
