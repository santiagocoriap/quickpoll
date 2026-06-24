import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireAdmin, canManagePoll, AuthError } from "@/lib/auth";
import { reopenStage } from "@/lib/poll-admin";
import { jsonOk } from "@/lib/utils";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireAdmin();
    const poll = await prisma.poll.findUnique({ where: { id: params.id } });
    if (!poll) throw new AuthError(404, "Poll not found");
    if (!canManagePoll(user, poll)) throw new AuthError(403, "Not allowed");

    const result = await reopenStage(params.id, user.id);
    return jsonOk(result);
  });
}
