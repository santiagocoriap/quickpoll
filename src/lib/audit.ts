import { prisma } from "./db";

export type AuditAction =
  | "POLL_CREATED"
  | "POLL_EDITED"
  | "RULE_CHANGED"
  | "POLL_OPENED"
  | "POLL_CLOSED"
  | "POLL_REOPENED"
  | "POLL_FINALIZED"
  | "POLL_ARCHIVED"
  | "VOTE_SUBMITTED"
  | "VOTE_EDITED"
  | "TIE_DETECTED"
  | "TIEBREAK_PHASE_CREATED"
  | "TIEBREAK_RESOLVED"
  | "STAGE_ADVANCED"
  | "STAGE_REOPENED"
  | "RESULT_FINALIZED"
  | "INVITE_CREATED"
  | "CODE_CREATED"
  | "USER_CREATED"
  | "GROUP_CREATED";

export async function audit(params: {
  action: AuditAction;
  pollId?: string | null;
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: params.action,
      pollId: params.pollId ?? null,
      actorId: params.actorId ?? null,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata ? (params.metadata as object) : undefined,
    },
  });
}
