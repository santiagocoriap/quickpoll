import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { inviteSchema } from "@/lib/validation";
import { randomToken } from "@/lib/password";
import { audit } from "@/lib/audit";
import { appUrl, jsonOk } from "@/lib/utils";

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireAdmin();
    const data = inviteSchema.parse(await req.json());
    const invite = await prisma.invite.create({
      data: {
        token: randomToken(),
        pollId: data.pollId ?? null,
        email: data.email ?? null,
        role: data.role,
        groupIds: data.groupIds.length ? data.groupIds : undefined,
        maxUses: data.maxUses,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        createdById: user.id,
      },
    });
    await audit({ action: "INVITE_CREATED", pollId: data.pollId ?? null, actorId: user.id, targetId: invite.id });
    return jsonOk({ invite: { id: invite.id, url: appUrl(`/invite/${invite.token}`) } });
  });
}
