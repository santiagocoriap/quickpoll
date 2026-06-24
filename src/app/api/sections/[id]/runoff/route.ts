import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireAdmin, canManagePoll, AuthError } from "@/lib/auth";
import { createRunoffPhase } from "@/lib/poll-admin";
import { jsonOk } from "@/lib/utils";
import { z } from "zod";

const schema = z.object({
  optionIds: z.array(z.string()).min(2),
  label: z.string().max(120).optional(),
  seed: z.string().max(120).optional(),
  method: z.enum(["SINGLE", "MULTIPLE", "RANKED", "SCORE", "APPROVAL"]).optional(),
  minSelections: z.number().int().min(0).nullable().optional(),
  maxSelections: z.number().int().min(1).nullable().optional(),
  exactSelections: z.number().int().min(1).nullable().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireAdmin();
    const section = await prisma.pollSection.findUnique({
      where: { id: params.id },
      include: { poll: true },
    });
    if (!section) throw new AuthError(404, "Section not found");
    if (!canManagePoll(user, section.poll)) throw new AuthError(403, "Not allowed");

    const data = schema.parse(await req.json());
    const phase = await createRunoffPhase({
      sectionId: params.id,
      optionIds: data.optionIds,
      label: data.label,
      seed: data.seed,
      method: data.method,
      minSelections: data.minSelections,
      maxSelections: data.maxSelections,
      exactSelections: data.exactSelections,
      actorId: user.id,
    });
    return jsonOk({ phaseId: phase.id });
  });
}
