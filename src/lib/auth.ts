// Authentication / authorization helpers used by server components & routes.

import { prisma } from "./db";
import { readSession } from "./session";

export type Role = "SUPER_ADMIN" | "POLL_ADMIN" | "VOTER";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  groupIds: string[];
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await readSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { groups: true },
  });
  if (!user || !user.isActive) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    groupIds: user.groups.map((g) => g.groupId),
  };
}

export function isAdmin(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "POLL_ADMIN";
}

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401, "Authentication required.");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isAdmin(user.role)) throw new AuthError(403, "Admin access required.");
  return user;
}

export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") throw new AuthError(403, "Super admin access required.");
  return user;
}

/** Whether the user may manage a particular poll (owner or super admin). */
export function canManagePoll(user: CurrentUser, poll: { ownerId: string }): boolean {
  return user.role === "SUPER_ADMIN" || poll.ownerId === user.id;
}

/** Has the system been set up yet (does any user exist)? */
export async function isSetupComplete(): Promise<boolean> {
  const count = await prisma.user.count();
  return count > 0;
}
