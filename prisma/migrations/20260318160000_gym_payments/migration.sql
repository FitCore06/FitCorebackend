-- CreateTable
CREATE TABLE "gym_payments" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount_inr" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gym_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gym_payments_gym_id_status_idx" ON "gym_payments"("gym_id", "status");

-- CreateIndex
CREATE INDEX "gym_payments_member_user_id_idx" ON "gym_payments"("member_user_id");

-- AddForeignKey
ALTER TABLE "gym_payments" ADD CONSTRAINT "gym_payments_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_payments" ADD CONSTRAINT "gym_payments_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;