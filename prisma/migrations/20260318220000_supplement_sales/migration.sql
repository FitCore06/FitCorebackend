CREATE TABLE "gym_supplement_sales" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "bill_number" TEXT NOT NULL,
    "line_items" JSONB NOT NULL,
    "amount_inr" INTEGER NOT NULL,
    "payment_method" TEXT NOT NULL,
    "notes" TEXT,
    "proof_mime_type" TEXT,
    "proof_data" TEXT,
    "whatsapp_phone" TEXT,
    "whatsapp_status" TEXT NOT NULL,
    "whatsapp_message" TEXT,
    "whatsapp_sent_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gym_supplement_sales_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gym_supplement_sales_gym_id_created_at_idx" ON "gym_supplement_sales"("gym_id", "created_at");
CREATE INDEX "gym_supplement_sales_member_user_id_idx" ON "gym_supplement_sales"("member_user_id");

ALTER TABLE "gym_supplement_sales" ADD CONSTRAINT "gym_supplement_sales_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gym_supplement_sales" ADD CONSTRAINT "gym_supplement_sales_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gym_supplement_sales" ADD CONSTRAINT "gym_supplement_sales_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;