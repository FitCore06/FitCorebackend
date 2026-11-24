-- Link member payment requests to a gym membership plan; owner notification actions
ALTER TABLE "gym_payments" ADD COLUMN IF NOT EXISTS "membership_plan_id" TEXT;

ALTER TABLE "gym_payments"
  ADD CONSTRAINT "gym_payments_membership_plan_id_fkey"
  FOREIGN KEY ("membership_plan_id") REFERENCES "gym_membership_plans"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "gym_payments_membership_plan_id_idx" ON "gym_payments"("membership_plan_id");

ALTER TABLE "gym_notifications" ADD COLUMN IF NOT EXISTS "action_type" TEXT;
ALTER TABLE "gym_notifications" ADD COLUMN IF NOT EXISTS "resource_id" TEXT;

CREATE INDEX IF NOT EXISTS "gym_notifications_action_resource_idx"
  ON "gym_notifications"("action_type", "resource_id");