-- CreateTable
CREATE TABLE "member_trainer_assignments" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "trainer_user_id" TEXT NOT NULL,
    "plan_label" TEXT NOT NULL,
    "membership_status" TEXT NOT NULL,
    "membership_note" TEXT,
    "next_session_note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_trainer_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_trainer_assignments_gym_id_member_user_id_key" ON "member_trainer_assignments"("gym_id", "member_user_id");

-- CreateIndex
CREATE INDEX "member_trainer_assignments_gym_id_idx" ON "member_trainer_assignments"("gym_id");

-- CreateIndex
CREATE INDEX "member_trainer_assignments_trainer_user_id_idx" ON "member_trainer_assignments"("trainer_user_id");

-- AddForeignKey
ALTER TABLE "member_trainer_assignments" ADD CONSTRAINT "member_trainer_assignments_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_trainer_assignments" ADD CONSTRAINT "member_trainer_assignments_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_trainer_assignments" ADD CONSTRAINT "member_trainer_assignments_trainer_user_id_fkey" FOREIGN KEY ("trainer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;