import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { UsersManager } from "./users-manager";

export default async function UsersPage() {
  const me = (await getCurrentUser())!;
  const [users, groups] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: { groups: true } }),
    prisma.group.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <UsersManager
      isSuperAdmin={me.role === "SUPER_ADMIN"}
      groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      initial={users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        groupIds: u.groups.map((g) => g.groupId),
      }))}
    />
  );
}
