import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireAdmin, requireSuperAdmin } from "@/lib/auth";
import { jsonOk } from "@/lib/utils";
import { z } from "zod";

const schema = z.object({
  groupIds: z.array(z.string()).optional(),
  role: z.enum(["SUPER_ADMIN", "POLL_ADMIN", "VOTER"]).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireAdmin();
    const data = schema.parse(await req.json());
    if (data.role) await requireSuperAdmin();

    await prisma.$transaction(async (tx) => {
      if (data.role || data.isActive != null) {
        await tx.user.update({
          where: { id: params.id },
          data: { role: data.role, isActive: data.isActive },
        });
      }
      if (data.groupIds) {
        await tx.userGroup.deleteMany({ where: { userId: params.id } });
        if (data.groupIds.length)
          await tx.userGroup.createMany({
            data: data.groupIds.map((groupId) => ({ userId: params.id, groupId })),
            skipDuplicates: true,
          });
      }
    });
    return jsonOk({ ok: true });
  });
}
