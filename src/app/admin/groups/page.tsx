import { prisma } from "@/lib/db";
import { GroupsManager } from "./groups-manager";

export default async function GroupsPage() {
  const groups = await prisma.group.findMany({
    orderBy: [{ priority: "desc" }, { name: "asc" }],
    include: { _count: { select: { members: true } } },
  });
  return (
    <GroupsManager
      initial={groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        priority: g.priority,
        members: g._count.members,
      }))}
    />
  );
}
