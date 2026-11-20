CREATE TABLE "trainer_leave_requests" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "trainer_user_id" TEXT NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_leave_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trainer_leave_requests_gym_id_status_idx" ON "trainer_leave_requests"("gym_id", "status");
CREATE INDEX "trainer_leave_requests_trainer_user_id_created_at_idx" ON "trainer_leave_requests"("trainer_user_id", "created_at");

ALTER TABLE "trainer_leave_requests" ADD CONSTRAINT "trainer_leave_requests_gym_id_fkey"
  FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trainer_leave_requests" ADD CONSTRAINT "trainer_leave_requests_trainer_user_id_fkey"
  FOREIGN KEY ("trainer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trainer_leave_requests" ADD CONSTRAINT "trainer_leave_requests_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
