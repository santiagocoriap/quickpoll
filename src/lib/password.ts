import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Cryptographically strong, URL-safe random token (for invites / share links). */
export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Short human-friendly one-time voter code, e.g. "K7P2-9QXM". */
export function generateVoterCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  const pick = () =>
    Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
  return `${pick()}-${pick()}`;
}

/** Hash a voter code for storage (codes are shown once, only the hash is kept). */
export function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}
