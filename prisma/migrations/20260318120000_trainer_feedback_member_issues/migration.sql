-- CreateTable
CREATE TABLE "trainer_feedback" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "trainer_user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "feedback_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_issues" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "equipment_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trainer_feedback_gym_id_idx" ON "trainer_feedback"("gym_id");

-- CreateIndex
CREATE INDEX "trainer_feedback_trainer_user_id_idx" ON "trainer_feedback"("trainer_user_id");

-- CreateIndex
CREATE INDEX "trainer_feedback_member_user_id_idx" ON "trainer_feedback"("member_user_id");

-- CreateIndex
CREATE INDEX "member_issues_gym_id_idx" ON "member_issues"("gym_id");

-- CreateIndex
CREATE INDEX "member_issues_member_user_id_idx" ON "member_issues"("member_user_id");

-- AddForeignKey
ALTER TABLE "trainer_feedback" ADD CONSTRAINT "trainer_feedback_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_feedback" ADD CONSTRAINT "trainer_feedback_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_feedback" ADD CONSTRAINT "trainer_feedback_trainer_user_id_fkey" FOREIGN KEY ("trainer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_issues" ADD CONSTRAINT "member_issues_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_issues" ADD CONSTRAINT "member_issues_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;