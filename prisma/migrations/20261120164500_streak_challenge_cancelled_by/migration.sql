ALTER TABLE "member_streak_challenges" ADD COLUMN "cancelled_by_user_id" TEXT;

ALTER TABLE "member_streak_challenges" ADD CONSTRAINT "member_streak_challenges_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Legacy cancels were challenger-only before this column existed.
UPDATE "member_streak_challenges"
SET "cancelled_by_user_id" = "challenger_user_id"
WHERE "status" = 'cancelled' AND "cancelled_by_user_id" IS NULL;