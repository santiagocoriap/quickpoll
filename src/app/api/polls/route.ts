import { handle } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { pollSchema } from "@/lib/validation";
import { createPoll } from "@/lib/poll-admin";
import { jsonOk } from "@/lib/utils";

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireAdmin();
    const data = pollSchema.parse(await req.json());
    const poll = await createPoll(data, user.id);
    return jsonOk({ id: poll.id, slug: poll.slug });
  });
}
