CREATE TABLE "trainer_schedule_blocks" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "trainer_user_id" TEXT NOT NULL,
    "time_label" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "block_type" TEXT NOT NULL,
    "duration_min" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "trainer_schedule_blocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trainer_block_outcomes" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "trainer_user_id" TEXT NOT NULL,
    "block_id" TEXT NOT NULL,
    "log_date" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "trainer_block_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trainer_schedule_blocks_gym_id_trainer_user_id_idx" ON "trainer_schedule_blocks"("gym_id", "trainer_user_id");
CREATE UNIQUE INDEX "trainer_block_outcomes_block_id_log_date_key" ON "trainer_block_outcomes"("block_id", "log_date");
CREATE INDEX "trainer_block_outcomes_trainer_user_id_log_date_idx" ON "trainer_block_outcomes"("trainer_user_id", "log_date");

ALTER TABLE "trainer_schedule_blocks" ADD CONSTRAINT "trainer_schedule_blocks_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trainer_schedule_blocks" ADD CONSTRAINT "trainer_schedule_blocks_trainer_user_id_fkey" FOREIGN KEY ("trainer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trainer_block_outcomes" ADD CONSTRAINT "trainer_block_outcomes_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trainer_block_outcomes" ADD CONSTRAINT "trainer_block_outcomes_trainer_user_id_fkey" FOREIGN KEY ("trainer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trainer_block_outcomes" ADD CONSTRAINT "trainer_block_outcomes_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "trainer_schedule_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;