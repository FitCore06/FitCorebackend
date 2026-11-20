-- CreateTable
CREATE TABLE "exercises" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'strength',
    "primary_muscle" TEXT NOT NULL,
    "secondary_muscles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "equipment" TEXT NOT NULL DEFAULT 'other',
    "instructions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "media_mime_type" TEXT,
    "media_base64" TEXT,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- Partial Unique Index for Global standard exercises (gym_id IS NULL)
CREATE UNIQUE INDEX "exercises_global_slug_unique_idx" ON "exercises"("slug") WHERE "gym_id" IS NULL;

-- Unique Index for Gym Custom exercises (gym_id IS NOT NULL)
CREATE UNIQUE INDEX "exercises_gym_custom_slug_unique_idx" ON "exercises"("gym_id", "slug") WHERE "gym_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "exercises_gym_id_idx" ON "exercises"("gym_id");

-- CreateIndex
CREATE INDEX "exercises_primary_muscle_idx" ON "exercises"("primary_muscle");

-- CreateIndex
CREATE INDEX "exercises_equipment_idx" ON "exercises"("equipment");

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
