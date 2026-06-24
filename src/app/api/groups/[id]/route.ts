import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { groupSchema } from "@/lib/validation";
import { jsonOk } from "@/lib/utils";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireAdmin();
    const data = groupSchema.partial().parse(await req.json());
    const group = await prisma.group.update({ where: { id: params.id }, data });
    return jsonOk({ group });
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireAdmin();
    await prisma.group.delete({ where: { id: params.id } });
    return jsonOk({ ok: true });
  });
}
