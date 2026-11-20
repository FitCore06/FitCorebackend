-- CreateTable
CREATE TABLE "workout_set_logs" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "log_date" TEXT NOT NULL,
    "day_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "set_number" INTEGER NOT NULL,
    "weight_kg" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_set_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diet_meal_logs" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "log_date" TEXT NOT NULL,
    "meal_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diet_meal_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_set_logs_gym_id_log_date_idx" ON "workout_set_logs"("gym_id", "log_date");

-- CreateIndex
CREATE UNIQUE INDEX "workout_set_logs_member_user_id_log_date_day_id_exercise_id_set_number_key" ON "workout_set_logs"("member_user_id", "log_date", "day_id", "exercise_id", "set_number");

-- CreateIndex
CREATE INDEX "diet_meal_logs_gym_id_log_date_idx" ON "diet_meal_logs"("gym_id", "log_date");

-- CreateIndex
CREATE UNIQUE INDEX "diet_meal_logs_member_user_id_log_date_meal_id_key" ON "diet_meal_logs"("member_user_id", "log_date", "meal_id");

-- AddForeignKey
ALTER TABLE "workout_set_logs" ADD CONSTRAINT "workout_set_logs_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_set_logs" ADD CONSTRAINT "workout_set_logs_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_meal_logs" ADD CONSTRAINT "diet_meal_logs_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_meal_logs" ADD CONSTRAINT "diet_meal_logs_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;