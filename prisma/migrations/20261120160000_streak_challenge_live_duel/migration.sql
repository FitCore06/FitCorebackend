ALTER TABLE "member_streak_challenges" ADD COLUMN "active_day" TEXT;
ALTER TABLE "member_streak_challenges" ADD COLUMN "winner_user_id" TEXT;
ALTER TABLE "member_streak_challenges" ADD COLUMN "win_reason" TEXT;
ALTER TABLE "member_streak_challenges" ADD COLUMN "challenger_started_at" TIMESTAMP(3);
ALTER TABLE "member_streak_challenges" ADD COLUMN "challenged_started_at" TIMESTAMP(3);
ALTER TABLE "member_streak_challenges" ADD COLUMN "completed_at" TIMESTAMP(3);

CREATE INDEX "member_streak_challenges_gym_id_status_active_day_idx" ON "member_streak_challenges"("gym_id", "status", "active_day");

CREATE TABLE "member_streak_challenge_set_completions" (
    "id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "set_number" INTEGER NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_streak_challenge_set_completions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "member_streak_challenge_set_completions_challenge_id_user_id_set_number_key" ON "member_streak_challenge_set_completions"("challenge_id", "user_id", "set_number");
CREATE INDEX "member_streak_challenge_set_completions_challenge_id_idx" ON "member_streak_challenge_set_completions"("challenge_id");

ALTER TABLE "member_streak_challenges" ADD CONSTRAINT "member_streak_challenges_winner_user_id_fkey" FOREIGN KEY ("winner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "member_streak_challenge_set_completions" ADD CONSTRAINT "member_streak_challenge_set_completions_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "member_streak_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;