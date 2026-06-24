// Demo seed: a sim racing championship poll.
//
//   docker compose exec web npm run db:seed
//   # or locally:  npm run db:seed
//
// Creates groups, users, the "Season 4 Championship Vote" poll with per-group
// limits (Regular Voter = 3, Previous Champion = 4), and a few votes that
// produce a tie in one section so you can try the runoff flow immediately.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const pass = (p: string) => bcrypt.hash(p, 12);

  // --- Groups ---------------------------------------------------------------
  const regular = await prisma.group.upsert({
    where: { name: "Regular Voter" },
    update: {},
    create: { name: "Regular Voter", description: "Standard voters", priority: 0 },
  });
  const champion = await prisma.group.upsert({
    where: { name: "Previous Champion" },
    update: {},
    create: { name: "Previous Champion", description: "Last season's champion", priority: 10 },
  });

  // --- Users ----------------------------------------------------------------
  const admin = await prisma.user.upsert({
    where: { email: "admin@pollforge.local" },
    update: {},
    create: { name: "Admin", email: "admin@pollforge.local", passwordHash: await pass("admin1234"), role: "SUPER_ADMIN" },
  });

  async function voter(email: string, name: string, groupId: string) {
    const u = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { name, email, passwordHash: await pass("voter1234"), role: "VOTER" },
    });
    await prisma.userGroup.upsert({
      where: { userId_groupId: { userId: u.id, groupId } },
      update: {},
      create: { userId: u.id, groupId },
    });
    return u;
  }

  const voterA = await voter("voter@pollforge.local", "Alex Driver", regular.id);
  const voterB = await voter("rookie@pollforge.local", "Robin Rookie", regular.id);
  const champ = await voter("champion@pollforge.local", "Charlie Champion", champion.id);

  // --- Poll -----------------------------------------------------------------
  // Reset any previous demo poll to keep the seed idempotent.
  await prisma.poll.deleteMany({ where: { slug: "season-4-championship-vote" } });

  const poll = await prisma.poll.create({
    data: {
      title: "Season 4 Championship Vote",
      description: "Vote on the car classes and tracks for next season.",
      slug: "season-4-championship-vote",
      visibility: "PRIVATE",
      ownerId: admin.id,
      status: "OPEN",
    },
  });

  async function section(title: string, optionLabels: string[]) {
    const sec = await prisma.pollSection.create({
      data: {
        pollId: poll.id,
        title,
        method: "MULTIPLE",
        minSelections: 1,
        maxSelections: 3, // default; group limits override
        numWinners: 1,
        resultVisibility: "AFTER_CLOSE",
        anonymity: "ADMIN_VISIBLE",
        conflictStrategy: "HIGHEST",
        tieBreakStrategy: "RUNOFF",
        groupLimits: {
          create: [
            { groupId: regular.id, maxSelections: 3, voteWeight: 1, canVote: true },
            { groupId: champion.id, maxSelections: 4, voteWeight: 1, canVote: true },
          ],
        },
        options: { create: optionLabels.map((label, i) => ({ label, position: i })) },
      },
      include: { options: true },
    });
    return sec;
  }

  const carClasses = await section("Car Classes", ["GT3", "GT4", "LMP2", "TCR", "Hypercar"]);
  const tracks = await section("Tracks", ["Monza", "Spa", "Silverstone", "Suzuka", "Bathurst"]);

  // --- Votes ----------------------------------------------------------------
  const opt = (sec: typeof carClasses, label: string) => sec.options.find((o) => o.label === label)!.id;

  async function castVote(sec: typeof carClasses, userId: string, labels: string[], weight = 1) {
    await prisma.vote.create({
      data: {
        pollId: poll.id,
        sectionId: sec.id,
        userId,
        weight,
        selections: { create: labels.map((l) => ({ optionId: opt(sec, l) })) },
      },
    });
  }

  // Car Classes: a clear winner (GT3).
  await castVote(carClasses, voterA.id, ["GT3", "GT4", "LMP2"]);
  await castVote(carClasses, voterB.id, ["GT3", "Hypercar", "TCR"]);
  await castVote(carClasses, champ.id, ["GT3", "GT4", "Hypercar", "LMP2"]);

  // Tracks: engineered tie between Monza and Spa for the single winning slot.
  await castVote(tracks, voterA.id, ["Monza", "Spa"]);
  await castVote(tracks, voterB.id, ["Monza", "Spa"]);
  await castVote(tracks, champ.id, ["Silverstone", "Suzuka", "Bathurst"]);

  console.log("\n✅ Seed complete.\n");
  console.log("  Super Admin:        admin@pollforge.local / admin1234");
  console.log("  Regular voter:      voter@pollforge.local / voter1234");
  console.log("  Regular voter:      rookie@pollforge.local / voter1234");
  console.log("  Previous Champion:  champion@pollforge.local / voter1234");
  console.log("\n  Poll: 'Season 4 Championship Vote' (OPEN)");
  console.log("  → Tracks section has a Monza/Spa tie — open it in the Tie-break tab to create a runoff.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
