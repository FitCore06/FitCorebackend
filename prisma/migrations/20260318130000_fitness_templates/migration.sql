-- CreateTable
CREATE TABLE "workout_templates" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "built_in_key" TEXT,
    "created_by_id" TEXT,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "days_per_week" INTEGER NOT NULL,
    "exercises" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diet_templates" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "built_in_key" TEXT,
    "created_by_id" TEXT,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "daily_calories" INTEGER NOT NULL,
    "protein_g" INTEGER NOT NULL,
    "carbs_g" INTEGER NOT NULL,
    "fat_g" INTEGER NOT NULL,
    "meals" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diet_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitness_plan_assignments" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "trainer_user_id" TEXT NOT NULL,
    "plan_type" TEXT NOT NULL,
    "template_ref" TEXT,
    "plan_snapshot" JSONB NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fitness_plan_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_templates_gym_id_idx" ON "workout_templates"("gym_id");

-- CreateIndex
CREATE UNIQUE INDEX "workout_templates_gym_id_built_in_key_key" ON "workout_templates"("gym_id", "built_in_key");

-- CreateIndex
CREATE INDEX "diet_templates_gym_id_idx" ON "diet_templates"("gym_id");

-- CreateIndex
CREATE UNIQUE INDEX "diet_templates_gym_id_built_in_key_key" ON "diet_templates"("gym_id", "built_in_key");

-- CreateIndex
CREATE INDEX "fitness_plan_assignments_gym_id_idx" ON "fitness_plan_assignments"("gym_id");

-- CreateIndex
CREATE UNIQUE INDEX "fitness_plan_assignments_gym_id_member_user_id_plan_type_key" ON "fitness_plan_assignments"("gym_id", "member_user_id", "plan_type");

-- AddForeignKey
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_templates" ADD CONSTRAINT "diet_templates_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_templates" ADD CONSTRAINT "diet_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fitness_plan_assignments" ADD CONSTRAINT "fitness_plan_assignments_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fitness_plan_assignments" ADD CONSTRAINT "fitness_plan_assignments_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fitness_plan_assignments" ADD CONSTRAINT "fitness_plan_assignments_trainer_user_id_fkey" FOREIGN KEY ("trainer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;