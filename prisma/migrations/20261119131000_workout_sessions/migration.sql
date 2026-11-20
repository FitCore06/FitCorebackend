-- CreateTable
CREATE TABLE "workout_sessions" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "member_user_id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "plan_id" TEXT,
    "plan_day_id" TEXT,
    "day_title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "accumulated_paused_seconds" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_session_exercises" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "exercise_id" TEXT,
    "exercise_name_snapshot" TEXT NOT NULL,
    "category_snapshot" TEXT NOT NULL DEFAULT 'strength',
    "primary_muscle_snapshot" TEXT NOT NULL DEFAULT 'other',
    "equipment_snapshot" TEXT NOT NULL DEFAULT 'other',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "target_sets" INTEGER NOT NULL DEFAULT 3,
    "target_reps" TEXT NOT NULL DEFAULT '10-12',
    "target_weight_kg" DOUBLE PRECISION,
    "rest_seconds" INTEGER NOT NULL DEFAULT 60,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_session_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_session_sets" (
    "id" TEXT NOT NULL,
    "session_exercise_id" TEXT NOT NULL,
    "set_number" INTEGER NOT NULL,
    "target_reps" TEXT NOT NULL DEFAULT '10-12',
    "actual_reps" INTEGER,
    "target_weight_kg" DOUBLE PRECISION,
    "actual_weight_kg" DOUBLE PRECISION,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_session_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_sessions_gym_id_member_user_id_status_idx" ON "workout_sessions"("gym_id", "member_user_id", "status");

-- CreateIndex
CREATE INDEX "workout_sessions_member_user_id_status_idx" ON "workout_sessions"("member_user_id", "status");

-- CreateIndex
CREATE INDEX "workout_session_exercises_session_id_idx" ON "workout_session_exercises"("session_id");

-- CreateIndex
CREATE INDEX "workout_session_exercises_exercise_id_idx" ON "workout_session_exercises"("exercise_id");

-- CreateIndex
CREATE INDEX "workout_session_sets_session_exercise_id_idx" ON "workout_session_sets"("session_exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "workout_session_sets_session_exercise_id_set_number_key" ON "workout_session_sets"("session_exercise_id", "set_number");

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "workout_plan_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "workout_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_session_sets" ADD CONSTRAINT "workout_session_sets_session_exercise_id_fkey" FOREIGN KEY ("session_exercise_id") REFERENCES "workout_session_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

