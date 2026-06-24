import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireAdmin, canManagePoll, AuthError } from "@/lib/auth";
import { transitionPoll } from "@/lib/poll-admin";
import { jsonOk } from "@/lib/utils";
import { z } from "zod";

const schema = z.object({
  status: z.enum(["DRAFT", "SCHEDULED", "OPEN", "CLOSED", "NEEDS_TIEBREAK", "FINALIZED", "ARCHIVED"]),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireAdmin();
    const poll = await prisma.poll.findUnique({ where: { id: params.id } });
    if (!poll) throw new AuthError(404, "Poll not found");
    if (!canManagePoll(user, poll)) throw new AuthError(403, "Not allowed");

    const { status } = schema.parse(await req.json());
    const updated = await transitionPoll(params.id, status, user.id);
    return jsonOk({ status: updated.status });
  });
}
