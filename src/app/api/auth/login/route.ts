import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { jsonOk, jsonError } from "@/lib/utils";

export async function POST(req: Request) {
  return handle(async () => {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    const rl = rateLimit(`login:${ip}`, 10, 60_000);
    if (!rl.ok) return jsonError("Too many attempts. Try again shortly.", 429);

    const data = loginSchema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (!user || !user.isActive || !(await verifyPassword(data.password, user.passwordHash))) {
      return jsonError("Invalid email or password.", 401);
    }
    await createSession({ userId: user.id, role: user.role, email: user.email });
    return jsonOk({ id: user.id, role: user.role });
  });
}
