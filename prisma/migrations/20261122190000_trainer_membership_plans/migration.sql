CREATE TABLE "trainer_membership_plans" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duration_label" TEXT NOT NULL,
    "price_inr" INTEGER NOT NULL,
    "duration_days" INTEGER NOT NULL,

    CONSTRAINT "trainer_membership_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trainer_membership_plans_gym_id_idx" ON "trainer_membership_plans"("gym_id");

ALTER TABLE "trainer_membership_plans" ADD CONSTRAINT "trainer_membership_plans_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_trainer_assignments" ADD COLUMN "trainer_plan_id" TEXT,
ADD COLUMN "plan_ends_at" DATE;

ALTER TABLE "member_trainer_assignments" ADD CONSTRAINT "member_trainer_assignments_trainer_plan_id_fkey" FOREIGN KEY ("trainer_plan_id") REFERENCES "trainer_membership_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;