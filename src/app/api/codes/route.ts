import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireAdmin, canManagePoll, AuthError } from "@/lib/auth";
import { voterCodeSchema } from "@/lib/validation";
import { generateVoterCode, hashCode } from "@/lib/password";
import { audit } from "@/lib/audit";
import { jsonOk } from "@/lib/utils";

// Generates one-time voter codes for a private poll. The plaintext codes are
// returned ONCE here; only their hashes are stored.
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireAdmin();
    const data = voterCodeSchema.parse(await req.json());
    const poll = await prisma.poll.findUnique({ where: { id: data.pollId } });
    if (!poll) throw new AuthError(404, "Poll not found");
    if (!canManagePoll(user, poll)) throw new AuthError(403, "Not allowed");

    const codes: string[] = [];
    for (let i = 0; i < data.count; i++) {
      const code = generateVoterCode();
      codes.push(code);
      await prisma.voterCode.create({
        data: {
          pollId: data.pollId,
          codeHash: hashCode(code),
          label: data.label,
          groupIds: data.groupIds.length ? data.groupIds : undefined,
        },
      });
    }
    await audit({ action: "CODE_CREATED", pollId: data.pollId, actorId: user.id, metadata: { count: data.count } });
    return jsonOk({ codes });
  });
}
