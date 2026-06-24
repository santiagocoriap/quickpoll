import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { groupSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { jsonOk } from "@/lib/utils";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const groups = await prisma.group.findMany({
      orderBy: [{ priority: "desc" }, { name: "asc" }],
      include: { _count: { select: { members: true } } },
    });
    return jsonOk({ groups });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireAdmin();
    const data = groupSchema.parse(await req.json());
    const group = await prisma.group.create({ data });
    await audit({ action: "GROUP_CREATED", actorId: user.id, targetType: "Group", targetId: group.id, metadata: { name: group.name } });
    return jsonOk({ group });
  });
}
