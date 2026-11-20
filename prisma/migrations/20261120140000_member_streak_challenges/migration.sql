CREATE TABLE "member_streak_challenges" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "challenger_user_id" TEXT NOT NULL,
    "challenged_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "member_streak_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "member_streak_challenges_gym_id_challenged_user_id_status_idx" ON "member_streak_challenges"("gym_id", "challenged_user_id", "status");
CREATE INDEX "member_streak_challenges_gym_id_challenger_user_id_status_idx" ON "member_streak_challenges"("gym_id", "challenger_user_id", "status");

CREATE UNIQUE INDEX "member_streak_challenges_pending_direct_pair"
ON "member_streak_challenges" ("gym_id", "challenger_user_id", "challenged_user_id")
WHERE "status" = 'pending';

ALTER TABLE "member_streak_challenges" ADD CONSTRAINT "member_streak_challenges_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_streak_challenges" ADD CONSTRAINT "member_streak_challenges_challenger_user_id_fkey" FOREIGN KEY ("challenger_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_streak_challenges" ADD CONSTRAINT "member_streak_challenges_challenged_user_id_fkey" FOREIGN KEY ("challenged_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;