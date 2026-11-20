ALTER TABLE "member_streak_challenges" ADD COLUMN "exercise_id" TEXT;
ALTER TABLE "member_streak_challenges" ADD COLUMN "exercise_name" TEXT NOT NULL DEFAULT 'Workout';
ALTER TABLE "member_streak_challenges" ADD COLUMN "set_count" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "member_streak_challenges" ADD COLUMN "target_weight_kg" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "member_streak_challenges" ALTER COLUMN "exercise_name" DROP DEFAULT;