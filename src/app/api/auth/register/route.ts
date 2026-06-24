import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { jsonOk, jsonError } from "@/lib/utils";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

// Accept an invite link: create the account, assign role + groups + poll access.
export async function POST(req: Request) {
  return handle(async () => {
    const data = schema.parse(await req.json());
    const invite = await prisma.invite.findUnique({ where: { token: data.token } });
    if (!invite) return jsonError("Invalid invite link.", 404);
    if (invite.expiresAt && invite.expiresAt < new Date()) return jsonError("This invite has expired.", 410);
    if (invite.uses >= invite.maxUses) return jsonError("This invite has been used up.", 410);
    if (invite.email && invite.email.toLowerCase() !== data.email.toLowerCase())
      return jsonError("This invite is for a different email address.", 403);

    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) return jsonError("An account with that email already exists. Please log in.", 409);

    const groupIds = Array.isArray(invite.groupIds) ? (invite.groupIds as string[]) : [];

    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: data.name,
          email: data.email.toLowerCase(),
          passwordHash: await hashPassword(data.password),
          role: invite.role,
        },
      });
      if (groupIds.length)
        await tx.userGroup.createMany({ data: groupIds.map((groupId) => ({ userId: u.id, groupId })), skipDuplicates: true });
      if (invite.pollId)
        await tx.pollAccess.create({ data: { pollId: invite.pollId, userId: u.id } });
      await tx.invite.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } });
      return u;
    });

    await createSession({ userId: user.id, role: user.role, email: user.email });
    await audit({ action: "USER_CREATED", actorId: user.id, pollId: invite.pollId, metadata: { viaInvite: true } });
    return jsonOk({ id: user.id, role: user.role, pollId: invite.pollId });
  });
}
