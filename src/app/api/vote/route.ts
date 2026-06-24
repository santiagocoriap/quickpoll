import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { ballotSchema } from "@/lib/validation";
import { submitVote } from "@/lib/poll-service";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { jsonOk, jsonError } from "@/lib/utils";

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const rl = rateLimit(`vote:${user.id}`, 30, 60_000);
    if (!rl.ok) return jsonError("You are voting too quickly. Please wait a moment.", 429);

    const data = ballotSchema.parse(await req.json());

    // Authorization: ensure the user has access to the poll this section belongs to.
    const section = await prisma.pollSection.findUnique({
      where: { id: data.sectionId },
      include: { poll: { include: { access: true } } },
    });
    if (!section) return jsonError("Section not found.", 404);

    if (section.poll.visibility === "PRIVATE") {
      const access = section.poll.access;
      const directly = access.some((a) => a.userId === user.id);
      const viaGroup = access.some((a) => a.groupId && user.groupIds.includes(a.groupId));
      const isOwnerOrSuper = section.poll.ownerId === user.id || user.role === "SUPER_ADMIN";
      if (access.length > 0 && !directly && !viaGroup && !isOwnerOrSuper)
        return jsonError("You do not have access to this poll.", 403);
    }

    const result = await submitVote({
      sectionId: data.sectionId,
      userId: user.id,
      phaseId: data.phaseId ?? null,
      ballot: { selections: data.selections },
    });

    if (!result.ok) return jsonError(result.errors.join(" "), 422);

    await audit({
      action: result.edited ? "VOTE_EDITED" : "VOTE_SUBMITTED",
      pollId: section.pollId,
      actorId: user.id,
      targetType: "PollSection",
      targetId: data.sectionId,
      metadata: { phaseId: data.phaseId ?? null },
    });
    return jsonOk({ ok: true, voteId: result.voteId, edited: result.edited });
  });
}
