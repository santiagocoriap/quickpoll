import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireAdmin, canManagePoll, AuthError } from "@/lib/auth";
import { computeSection } from "@/lib/poll-service";
import { audit } from "@/lib/audit";
import { jsonOk } from "@/lib/utils";

// Close a runoff phase and snapshot its result.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireAdmin();
    const phase = await prisma.pollPhase.findUnique({ where: { id: params.id }, include: { poll: true } });
    if (!phase) throw new AuthError(404, "Phase not found");
    if (!canManagePoll(user, phase.poll)) throw new AuthError(403, "Not allowed");

    const optionIds = Array.isArray(phase.optionIds) ? (phase.optionIds as string[]) : undefined;
    const computed = await computeSection(phase.sectionId, phase.id, optionIds, phase.seats, phase.method);

    await prisma.pollPhase.update({
      where: { id: phase.id },
      data: { status: "CLOSED", closedAt: new Date(), resultJson: (computed?.result as object) ?? undefined },
    });
    await audit({
      action: "TIEBREAK_RESOLVED",
      pollId: phase.pollId,
      actorId: user.id,
      targetType: "PollPhase",
      targetId: phase.id,
      metadata: { winners: computed?.result.winners, tie: computed?.result.tie },
    });
    return jsonOk({ result: computed?.result });
  });
}
