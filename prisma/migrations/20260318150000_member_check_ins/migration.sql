-- CreateTable
CREATE TABLE "member_check_ins" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "branch_name" TEXT NOT NULL DEFAULT 'Main branch',
    "check_in_token" TEXT,
    "check_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "check_out_at" TIMESTAMP(3),

    CONSTRAINT "member_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_check_ins_gym_id_check_out_at_idx" ON "member_check_ins"("gym_id", "check_out_at");

-- CreateIndex
CREATE INDEX "member_check_ins_member_user_id_check_in_at_idx" ON "member_check_ins"("member_user_id", "check_in_at");

-- AddForeignKey
ALTER TABLE "member_check_ins" ADD CONSTRAINT "member_check_ins_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_check_ins" ADD CONSTRAINT "member_check_ins_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;