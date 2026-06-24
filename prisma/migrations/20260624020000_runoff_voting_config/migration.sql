-- AlterTable
ALTER TABLE "PollPhase" ADD COLUMN "method" "VotingMethod" NOT NULL DEFAULT 'SINGLE';
ALTER TABLE "PollPhase" ADD COLUMN "minSelections" INTEGER;
ALTER TABLE "PollPhase" ADD COLUMN "maxSelections" INTEGER;
ALTER TABLE "PollPhase" ADD COLUMN "exactSelections" INTEGER;
