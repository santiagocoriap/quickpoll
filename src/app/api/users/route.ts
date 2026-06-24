import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireAdmin, requireSuperAdmin } from "@/lib/auth";
import { userSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { jsonOk, jsonError } from "@/lib/utils";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { groups: { include: { group: true } } },
    });
    return jsonOk({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        groups: u.groups.map((g) => ({ id: g.groupId, name: g.group.name })),
      })),
    });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const actor = await requireAdmin();
    const data = userSchema.parse(await req.json());
    // Only super admins may mint new admins.
    if (data.role !== "VOTER") await requireSuperAdmin();

    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) return jsonError("A user with that email already exists.", 409);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash: await hashPassword(data.password),
        role: data.role,
        groups: { create: data.groupIds.map((groupId) => ({ groupId })) },
      },
    });
    await audit({ action: "USER_CREATED", actorId: actor.id, targetType: "User", targetId: user.id, metadata: { role: data.role } });
    return jsonOk({ id: user.id });
  });
}
