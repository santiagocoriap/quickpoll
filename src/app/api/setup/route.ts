import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { setupSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { jsonOk, jsonError } from "@/lib/utils";

// Creates the first Super Admin. Only works when no users exist yet.
export async function POST(req: Request) {
  return handle(async () => {
    const existing = await prisma.user.count();
    if (existing > 0) return jsonError("Setup has already been completed.", 409);

    const data = setupSchema.parse(await req.json());
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash: await hashPassword(data.password),
        role: "SUPER_ADMIN",
      },
    });

    // Seed a couple of common default groups so admins have a starting point.
    await prisma.group.createMany({
      data: [
        { name: "Regular Voter", description: "Default voter group", priority: 0 },
        { name: "Guest", description: "Limited access", priority: 0 },
      ],
      skipDuplicates: true,
    });

    await createSession({ userId: user.id, role: user.role, email: user.email });
    await audit({ action: "USER_CREATED", actorId: user.id, metadata: { role: "SUPER_ADMIN", setup: true } });
    return jsonOk({ id: user.id });
  });
}
