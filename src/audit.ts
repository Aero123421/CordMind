import { db } from "./db.js";
import { Prisma } from "@prisma/client";

type AuditPayload = {
  request: {
    action: string;
    params: Record<string, unknown>;
    actions?: Array<{ action: string; params: Record<string, unknown> }>;
    raw_text?: string;
    thread_id?: string;
  };
  impact: {
    channels?: string[];
    roles?: string[];
    members?: string[];
    permissions?: string[];
  };
  result?: {
    ok: boolean;
    message: string;
    discord_ids?: string[];
  };
};

export const createAuditEvent = async (input: {
  action: string;
  actor_user_id: string;
  guild_id: string;
  target_id?: string | null;
  payload: AuditPayload;
  confirmation_required: boolean;
  confirmation_status: "none" | "pending" | "approved" | "rejected";
  status: "pending" | "success" | "failure";
  error_message?: string | null;
}) => {
  const event = await db.auditEvent.create({
    data: {
      action: input.action,
      actor_user_id: input.actor_user_id,
      guild_id: input.guild_id,
      target_id: input.target_id ?? null,
      payload_json: input.payload as Prisma.InputJsonValue,
      confirmation_required: input.confirmation_required,
      confirmation_status: input.confirmation_status,
      status: input.status,
      error_message: input.error_message ?? null
    }
  });
  return event;
};

export const updateAuditEvent = async (
  id: string,
  data: Partial<{ status: string; confirmation_status: string; error_message: string | null; payload_json: AuditPayload }>
) => {
  return db.auditEvent.update({
    where: { id },
    data: {
      ...data,
      payload_json: data.payload_json ? (data.payload_json as Prisma.InputJsonValue) : undefined
    }
  });
};

export const cleanupAuditEvents = async (retentionDays: number) => {
  if (retentionDays <= 0) return { count: 0 };
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  return db.auditEvent.deleteMany({
    where: {
      created_at: {
        lt: cutoff
      }
    }
  });
};

export type { AuditPayload };
