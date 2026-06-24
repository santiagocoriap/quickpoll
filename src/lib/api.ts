import { AuthError } from "./auth";
import { jsonError } from "./utils";
import { ZodError } from "zod";

/** Wrap a route handler to translate known errors into JSON responses. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AuthError) return jsonError(err.message, err.status);
    if (err instanceof ZodError)
      return jsonError(err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 422);
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[api]", err);
    return jsonError(message, 400);
  }
}
