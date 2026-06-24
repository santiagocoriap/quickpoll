import { prisma } from "@/lib/db";
import { PollWizard } from "./poll-wizard";

export default async function NewPollPage() {
  const [groups, voters] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ]);
  return (
    <PollWizard
      groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      voters={voters}
    />
  );
}
