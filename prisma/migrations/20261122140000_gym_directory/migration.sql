-- CreateTable
CREATE TABLE "gym_directory_profiles" (
    "gym_id" TEXT NOT NULL,
    "is_listed" BOOLEAN NOT NULL DEFAULT false,
    "plan_tier" TEXT NOT NULL DEFAULT 'basic',
    "state" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "area" TEXT NOT NULL DEFAULT '',
    "address_line" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "contact_email" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gym_directory_profiles_pkey" PRIMARY KEY ("gym_id")
);

-- CreateTable
CREATE TABLE "gym_directory_reviews" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gym_directory_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gym_directory_profiles_is_listed_state_city_idx" ON "gym_directory_profiles"("is_listed", "state", "city");

-- CreateIndex
CREATE INDEX "gym_directory_reviews_gym_id_status_idx" ON "gym_directory_reviews"("gym_id", "status");

-- AddForeignKey
ALTER TABLE "gym_directory_profiles" ADD CONSTRAINT "gym_directory_profiles_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_directory_reviews" ADD CONSTRAINT "gym_directory_reviews_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;