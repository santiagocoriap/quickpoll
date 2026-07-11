import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireAdmin, canManagePoll, AuthError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { jsonOk } from "@/lib/utils";

// Delete a runoff phase. Only OPEN phases can be removed — once a runoff is
// closed its result is snapshotted and part of the recorded outcome. Any votes
// cast in the phase cascade-delete with it (see Vote.phase onDelete: Cascade).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireAdmin();
    const phase = await prisma.pollPhase.findUnique({ where: { id: params.id }, include: { poll: true } });
    if (!phase) throw new AuthError(404, "Phase not found");
    if (!canManagePoll(user, phase.poll)) throw new AuthError(403, "Not allowed");
    if (phase.status !== "OPEN") throw new AuthError(400, "Only open runoffs can be deleted.");

    await prisma.pollPhase.delete({ where: { id: phase.id } });
    await audit({
      action: "TIEBREAK_PHASE_DELETED",
      pollId: phase.pollId,
      actorId: user.id,
      targetType: "PollPhase",
      targetId: phase.id,
      metadata: { sectionId: phase.sectionId, label: phase.label },
    });
    return jsonOk({ ok: true });
  });
}
