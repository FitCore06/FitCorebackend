ALTER TABLE "gym_membership_plans" ADD COLUMN "duration_days" INTEGER;

CREATE TABLE "member_memberships" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "starts_at" DATE NOT NULL,
    "ends_at" DATE NOT NULL,
    "renewed_from_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "member_memberships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "member_memberships_gym_id_member_user_id_created_at_idx" ON "member_memberships"("gym_id", "member_user_id", "created_at");
CREATE INDEX "member_memberships_gym_id_ends_at_status_idx" ON "member_memberships"("gym_id", "ends_at", "status");
CREATE UNIQUE INDEX "member_memberships_one_current_idx" ON "member_memberships"("gym_id", "member_user_id") WHERE "status" IN ('active', 'trial', 'frozen');

ALTER TABLE "member_memberships" ADD CONSTRAINT "member_memberships_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_memberships" ADD CONSTRAINT "member_memberships_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_memberships" ADD CONSTRAINT "member_memberships_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "gym_membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "member_memberships" ADD CONSTRAINT "member_memberships_renewed_from_id_fkey" FOREIGN KEY ("renewed_from_id") REFERENCES "member_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
