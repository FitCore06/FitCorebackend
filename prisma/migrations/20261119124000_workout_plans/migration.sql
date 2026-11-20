-- CreateTable
CREATE TABLE "workout_plans" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "goal" TEXT NOT NULL DEFAULT 'general_fitness',
    "difficulty" TEXT NOT NULL DEFAULT 'intermediate',
    "duration_weeks" INTEGER NOT NULL DEFAULT 4,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_plan_days" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "day_of_week" TEXT NOT NULL,
    "title" TEXT,
    "is_rest_day" BOOLEAN NOT NULL DEFAULT false,
    "warmup_note" TEXT,
    "cooldown_note" TEXT,
    "day_notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_plan_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_plan_exercises" (
    "id" TEXT NOT NULL,
    "day_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "sets" INTEGER NOT NULL DEFAULT 3,
    "target_reps" TEXT NOT NULL DEFAULT '10-12',
    "target_weight_kg" DOUBLE PRECISION,
    "rest_seconds" INTEGER NOT NULL DEFAULT 60,
    "superset_group_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_plan_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_plan_assignments" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "trainer_user_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_plan_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_plans_gym_id_idx" ON "workout_plans"("gym_id");

-- CreateIndex
CREATE INDEX "workout_plans_gym_id_status_idx" ON "workout_plans"("gym_id", "status");

-- CreateIndex
CREATE INDEX "workout_plans_created_by_id_idx" ON "workout_plans"("created_by_id");

-- CreateIndex
CREATE INDEX "workout_plan_days_plan_id_idx" ON "workout_plan_days"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "workout_plan_days_plan_id_day_of_week_key" ON "workout_plan_days"("plan_id", "day_of_week");

-- CreateIndex
CREATE INDEX "workout_plan_exercises_day_id_idx" ON "workout_plan_exercises"("day_id");

-- CreateIndex
CREATE INDEX "workout_plan_exercises_exercise_id_idx" ON "workout_plan_exercises"("exercise_id");

-- CreateIndex
CREATE INDEX "workout_plan_assignments_gym_id_member_user_id_status_idx" ON "workout_plan_assignments"("gym_id", "member_user_id", "status");

-- CreateIndex
CREATE INDEX "workout_plan_assignments_trainer_user_id_idx" ON "workout_plan_assignments"("trainer_user_id");

-- CreateIndex
CREATE INDEX "workout_plan_assignments_plan_id_idx" ON "workout_plan_assignments"("plan_id");

-- AddForeignKey
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plan_days" ADD CONSTRAINT "workout_plan_days_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "workout_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plan_exercises" ADD CONSTRAINT "workout_plan_exercises_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "workout_plan_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plan_exercises" ADD CONSTRAINT "workout_plan_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plan_assignments" ADD CONSTRAINT "workout_plan_assignments_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plan_assignments" ADD CONSTRAINT "workout_plan_assignments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "workout_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plan_assignments" ADD CONSTRAINT "workout_plan_assignments_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plan_assignments" ADD CONSTRAINT "workout_plan_assignments_trainer_user_id_fkey" FOREIGN KEY ("trainer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

