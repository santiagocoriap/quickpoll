import { destroySession } from "@/lib/session";
import { jsonOk } from "@/lib/utils";

export async function POST() {
  destroySession();
  return jsonOk({ ok: true });
}
