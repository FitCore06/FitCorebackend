-- Enforces the existing business rule: one open attendance visit per member per gym.
-- Completed visits remain unrestricted and historical data is preserved.
CREATE UNIQUE INDEX "member_check_ins_one_open_visit_key"
ON "member_check_ins" ("gym_id", "member_user_id")
WHERE "check_out_at" IS NULL;
