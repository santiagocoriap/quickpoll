-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'POLL_ADMIN', 'VOTER');

-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'NEEDS_TIEBREAK', 'FINALIZED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PollVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "VotingMethod" AS ENUM ('SINGLE', 'MULTIPLE', 'RANKED', 'SCORE', 'APPROVAL');

-- CreateEnum
CREATE TYPE "ResultVisibility" AS ENUM ('ALWAYS', 'AFTER_VOTE', 'AFTER_CLOSE', 'ADMIN_ONLY');

-- CreateEnum
CREATE TYPE "Anonymity" AS ENUM ('ANONYMOUS', 'ADMIN_VISIBLE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "TieBreakStrategy" AS ENUM ('MANUAL', 'RUNOFF', 'INSTANT_RUNOFF', 'PREVIOUS_ROUND', 'MOST_FIRST_PLACE', 'MOST_APPROVALS', 'RANDOM_SEED', 'KEEP_TIE');

-- CreateEnum
CREATE TYPE "LimitConflictStrategy" AS ENUM ('HIGHEST', 'LOWEST', 'PRIORITY', 'OVERRIDE');

-- CreateEnum
CREATE TYPE "PhaseStatus" AS ENUM ('OPEN', 'CLOSED', 'FINALIZED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VOTER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "UserGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "status" "PollStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "PollVisibility" NOT NULL DEFAULT 'PRIVATE',
    "ownerId" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "shareToken" TEXT NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollAccess" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT,
    "groupId" TEXT,

    CONSTRAINT "PollAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollSection" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "method" "VotingMethod" NOT NULL DEFAULT 'SINGLE',
    "minSelections" INTEGER,
    "maxSelections" INTEGER,
    "exactSelections" INTEGER,
    "minRanked" INTEGER,
    "maxRanked" INTEGER,
    "requireFullRank" BOOLEAN NOT NULL DEFAULT false,
    "scoreMin" INTEGER NOT NULL DEFAULT 0,
    "scoreMax" INTEGER NOT NULL DEFAULT 5,
    "allowSameScore" BOOLEAN NOT NULL DEFAULT true,
    "defaultWeight" INTEGER NOT NULL DEFAULT 1,
    "resultVisibility" "ResultVisibility" NOT NULL DEFAULT 'AFTER_CLOSE',
    "anonymity" "Anonymity" NOT NULL DEFAULT 'ADMIN_VISIBLE',
    "allowVoteEdit" BOOLEAN NOT NULL DEFAULT true,
    "conflictStrategy" "LimitConflictStrategy" NOT NULL DEFAULT 'HIGHEST',
    "allowedGroupIds" JSONB,
    "excludedGroupIds" JSONB,
    "tieBreakStrategy" "TieBreakStrategy" NOT NULL DEFAULT 'MANUAL',
    "numWinners" INTEGER NOT NULL DEFAULT 1,
    "advancedRule" JSONB,

    CONSTRAINT "PollSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollOption" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionGroupLimit" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "minSelections" INTEGER,
    "maxSelections" INTEGER,
    "exactSelections" INTEGER,
    "voteWeight" INTEGER NOT NULL DEFAULT 1,
    "canVote" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SectionGroupLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSectionOverride" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minSelections" INTEGER,
    "maxSelections" INTEGER,
    "exactSelections" INTEGER,
    "voteWeight" INTEGER,
    "canVote" BOOLEAN,

    CONSTRAINT "UserSectionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionGroupRule" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OptionGroupRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollRule" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollPhase" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "parentId" TEXT,
    "phaseIndex" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT NOT NULL,
    "status" "PhaseStatus" NOT NULL DEFAULT 'OPEN',
    "optionIds" JSONB NOT NULL,
    "seed" TEXT,
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "PollPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "phaseId" TEXT,
    "userId" TEXT,
    "voterCodeId" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteSelection" (
    "id" TEXT NOT NULL,
    "voteId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "rank" INTEGER,
    "score" INTEGER,
    "approved" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VoteSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "pollId" TEXT,
    "email" TEXT,
    "role" "Role" NOT NULL DEFAULT 'VOTER',
    "groupIds" JSONB,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoterCode" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "label" TEXT,
    "groupIds" JSONB,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoterCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "pollId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

-- CreateIndex
CREATE INDEX "UserGroup_groupId_idx" ON "UserGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "UserGroup_userId_groupId_key" ON "UserGroup"("userId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Poll_slug_key" ON "Poll"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Poll_shareToken_key" ON "Poll"("shareToken");

-- CreateIndex
CREATE INDEX "Poll_ownerId_idx" ON "Poll"("ownerId");

-- CreateIndex
CREATE INDEX "Poll_status_idx" ON "Poll"("status");

-- CreateIndex
CREATE INDEX "PollAccess_pollId_idx" ON "PollAccess"("pollId");

-- CreateIndex
CREATE INDEX "PollSection_pollId_idx" ON "PollSection"("pollId");

-- CreateIndex
CREATE INDEX "PollOption_sectionId_idx" ON "PollOption"("sectionId");

-- CreateIndex
CREATE INDEX "SectionGroupLimit_sectionId_idx" ON "SectionGroupLimit"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionGroupLimit_sectionId_groupId_key" ON "SectionGroupLimit"("sectionId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSectionOverride_sectionId_userId_key" ON "UserSectionOverride"("sectionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OptionGroupRule_optionId_groupId_key" ON "OptionGroupRule"("optionId", "groupId");

-- CreateIndex
CREATE INDEX "PollRule_sectionId_idx" ON "PollRule"("sectionId");

-- CreateIndex
CREATE INDEX "PollPhase_pollId_idx" ON "PollPhase"("pollId");

-- CreateIndex
CREATE INDEX "PollPhase_sectionId_idx" ON "PollPhase"("sectionId");

-- CreateIndex
CREATE INDEX "Vote_sectionId_phaseId_idx" ON "Vote"("sectionId", "phaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_sectionId_phaseId_userId_key" ON "Vote"("sectionId", "phaseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_sectionId_phaseId_voterCodeId_key" ON "Vote"("sectionId", "phaseId", "voterCodeId");

-- CreateIndex
CREATE INDEX "VoteSelection_optionId_idx" ON "VoteSelection"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "VoteSelection_voteId_optionId_key" ON "VoteSelection"("voteId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");

-- CreateIndex
CREATE INDEX "Invite_pollId_idx" ON "Invite"("pollId");

-- CreateIndex
CREATE UNIQUE INDEX "VoterCode_codeHash_key" ON "VoterCode"("codeHash");

-- CreateIndex
CREATE INDEX "VoterCode_pollId_idx" ON "VoterCode"("pollId");

-- CreateIndex
CREATE INDEX "AuditLog_pollId_idx" ON "AuditLog"("pollId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollAccess" ADD CONSTRAINT "PollAccess_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollAccess" ADD CONSTRAINT "PollAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollAccess" ADD CONSTRAINT "PollAccess_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollSection" ADD CONSTRAINT "PollSection_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PollSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionGroupLimit" ADD CONSTRAINT "SectionGroupLimit_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PollSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionGroupLimit" ADD CONSTRAINT "SectionGroupLimit_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSectionOverride" ADD CONSTRAINT "UserSectionOverride_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PollSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSectionOverride" ADD CONSTRAINT "UserSectionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroupRule" ADD CONSTRAINT "OptionGroupRule_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroupRule" ADD CONSTRAINT "OptionGroupRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollRule" ADD CONSTRAINT "PollRule_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PollSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollPhase" ADD CONSTRAINT "PollPhase_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollPhase" ADD CONSTRAINT "PollPhase_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PollSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollPhase" ADD CONSTRAINT "PollPhase_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PollPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PollSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "PollPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_voterCodeId_fkey" FOREIGN KEY ("voterCodeId") REFERENCES "VoterCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteSelection" ADD CONSTRAINT "VoteSelection_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "Vote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteSelection" ADD CONSTRAINT "VoteSelection_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoterCode" ADD CONSTRAINT "VoterCode_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

