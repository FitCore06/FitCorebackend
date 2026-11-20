CREATE TABLE "gym_other_expenses" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "amount_inr" INTEGER NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "proof_mime_type" TEXT,
    "proof_data" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gym_other_expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gym_other_expenses_gym_id_paid_at_idx" ON "gym_other_expenses"("gym_id", "paid_at");

ALTER TABLE "gym_other_expenses" ADD CONSTRAINT "gym_other_expenses_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gym_other_expenses" ADD CONSTRAINT "gym_other_expenses_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;