import { db } from "../db.js";

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
