CREATE TABLE "workout_personal_records" (
  "id" TEXT NOT NULL,
  "gym_id" TEXT NOT NULL,
  "member_user_id" TEXT NOT NULL,
  "exercise_id" TEXT,
  "exercise_name_snapshot" TEXT NOT NULL,
  "record_type" TEXT NOT NULL,
  "weight_kg" DOUBLE PRECISION,
  "repetitions" INTEGER,
  "achieved_at" TIMESTAMP(3) NOT NULL,
  "session_id" TEXT NOT NULL,
  "session_set_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workout_personal_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workout_personal_records_session_set_id_record_type_key"
ON "workout_personal_records"("session_set_id", "record_type");
CREATE INDEX "workout_personal_records_gym_id_member_user_id_exercise_id_idx"
ON "workout_personal_records"("gym_id", "member_user_id", "exercise_id");
CREATE INDEX "workout_personal_records_member_user_id_achieved_at_idx"
ON "workout_personal_records"("member_user_id", "achieved_at");

ALTER TABLE "workout_personal_records"
  ADD CONSTRAINT "workout_personal_records_gym_id_fkey"
  FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "workout_personal_records_member_user_id_fkey"
  FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "workout_personal_records_exercise_id_fkey"
  FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "workout_personal_records_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "workout_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "workout_personal_records_session_set_id_fkey"
  FOREIGN KEY ("session_set_id") REFERENCES "workout_session_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
