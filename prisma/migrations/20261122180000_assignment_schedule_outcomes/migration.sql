CREATE TABLE "trainer_assignment_session_outcomes" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "trainer_user_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "log_date" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_assignment_session_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trainer_assignment_session_outcomes_assignment_id_log_date_key" ON "trainer_assignment_session_outcomes"("assignment_id", "log_date");

CREATE INDEX "trainer_assignment_session_outcomes_trainer_user_id_log_date_idx" ON "trainer_assignment_session_outcomes"("trainer_user_id", "log_date");

ALTER TABLE "trainer_assignment_session_outcomes" ADD CONSTRAINT "trainer_assignment_session_outcomes_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "member_trainer_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;