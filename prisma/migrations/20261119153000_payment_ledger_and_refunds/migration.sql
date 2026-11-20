ALTER TABLE "gym_payments" ADD COLUMN "refunded_amount_inr" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "gym_payments" ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "gym_payments" ADD COLUMN "provider_order_id" TEXT;
CREATE UNIQUE INDEX "gym_payments_idempotency_key_key" ON "gym_payments"("idempotency_key");
CREATE UNIQUE INDEX "gym_payments_provider_order_id_key" ON "gym_payments"("provider_order_id");

CREATE TABLE "payment_refunds" (
  "id" TEXT NOT NULL,
  "gym_id" TEXT NOT NULL,
  "payment_id" TEXT NOT NULL,
  "amount_inr" INTEGER NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'succeeded',
  "idempotency_key" TEXT NOT NULL,
  "created_by_user_id" TEXT,
  "provider_refund_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_refunds_idempotency_key_key" ON "payment_refunds"("idempotency_key");
CREATE UNIQUE INDEX "payment_refunds_provider_refund_id_key" ON "payment_refunds"("provider_refund_id");
CREATE INDEX "payment_refunds_gym_id_created_at_idx" ON "payment_refunds"("gym_id", "created_at");
CREATE INDEX "payment_refunds_payment_id_idx" ON "payment_refunds"("payment_id");

CREATE TABLE "payment_ledger_entries" (
  "id" TEXT NOT NULL,
  "gym_id" TEXT NOT NULL,
  "payment_id" TEXT,
  "refund_id" TEXT,
  "kind" TEXT NOT NULL,
  "amount_inr" INTEGER NOT NULL,
  "event_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_ledger_entries_event_key_key" ON "payment_ledger_entries"("event_key");
CREATE INDEX "payment_ledger_entries_gym_id_created_at_idx" ON "payment_ledger_entries"("gym_id", "created_at");
CREATE INDEX "payment_ledger_entries_payment_id_idx" ON "payment_ledger_entries"("payment_id");

ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "gym_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_ledger_entries" ADD CONSTRAINT "payment_ledger_entries_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_ledger_entries" ADD CONSTRAINT "payment_ledger_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "gym_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_ledger_entries" ADD CONSTRAINT "payment_ledger_entries_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "payment_refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "gym_payments" SET "refunded_amount_inr" = "amount_inr" WHERE "status" = 'refunded';
INSERT INTO "payment_ledger_entries" ("id", "gym_id", "payment_id", "kind", "amount_inr", "event_key", "created_at")
SELECT gen_random_uuid()::text, "gym_id", "id", 'payment', "amount_inr", 'legacy-payment:' || "id", "created_at"
FROM "gym_payments";
INSERT INTO "payment_refunds" ("id", "gym_id", "payment_id", "amount_inr", "reason", "status", "idempotency_key", "created_at")
SELECT gen_random_uuid()::text, "gym_id", "id", "amount_inr", 'Legacy refunded payment', 'succeeded', 'legacy-refund:' || "id", "created_at"
FROM "gym_payments" WHERE "status" = 'refunded';
INSERT INTO "payment_ledger_entries" ("id", "gym_id", "payment_id", "refund_id", "kind", "amount_inr", "event_key", "created_at")
SELECT gen_random_uuid()::text, r."gym_id", r."payment_id", r."id", 'refund', -r."amount_inr", 'legacy-refund-ledger:' || r."id", r."created_at"
FROM "payment_refunds" r WHERE r."idempotency_key" LIKE 'legacy-refund:%';
