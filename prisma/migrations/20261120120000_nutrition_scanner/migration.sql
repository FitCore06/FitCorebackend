-- Nutrition scanner (additive; does not modify diet_meal_logs)

CREATE TABLE "nutrition_scan_logs" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "image_mime_type" TEXT,
    "image_sha256" TEXT,
    "vision_model" TEXT,
    "vision_raw" JSONB,
    "error_code" TEXT,
    "linked_diet_meal_id" TEXT,
    "log_date" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrition_scan_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_catalog" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT,
    "slug" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_hi" TEXT,
    "category" TEXT NOT NULL,
    "is_recipe" BOOLEAN NOT NULL DEFAULT false,
    "default_serving_g" DECIMAL(10,2),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "source_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_catalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_nutrition" (
    "food_catalog_id" TEXT NOT NULL,
    "per_100g" JSONB NOT NULL,
    "data_source" TEXT NOT NULL,
    "external_id" TEXT,
    "license" TEXT,
    "retrieved_at" TIMESTAMP(3),

    CONSTRAINT "food_nutrition_pkey" PRIMARY KEY ("food_catalog_id")
);

CREATE TABLE "food_recipes" (
    "food_catalog_id" TEXT NOT NULL,
    "ingredients" JSONB NOT NULL,
    "yield_grams" DECIMAL(10,2) NOT NULL,
    "cooking_method" TEXT,

    CONSTRAINT "food_recipes_pkey" PRIMARY KEY ("food_catalog_id")
);

CREATE TABLE "food_intake_entries" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "scan_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "log_date" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "quantity_grams" DECIMAL(10,2) NOT NULL,
    "calories" DECIMAL(10,2) NOT NULL,
    "protein_g" DECIMAL(10,2) NOT NULL,
    "carbs_g" DECIMAL(10,2) NOT NULL,
    "fat_g" DECIMAL(10,2) NOT NULL,
    "data_source" TEXT NOT NULL,
    "source_external_id" TEXT,
    "source_license" TEXT,
    "match_confidence" DOUBLE PRECISION,
    "portion_confidence" DOUBLE PRECISION,
    "is_estimate" BOOLEAN NOT NULL DEFAULT true,
    "estimated_snapshot" JSONB,
    "confirmed_snapshot" JSONB,
    "food_catalog_id" TEXT,
    "linked_diet_meal_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_intake_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_barcodes" (
    "id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "food_catalog_id" TEXT,
    "provider" TEXT NOT NULL,
    "provider_id" TEXT,
    "last_lookup_at" TIMESTAMP(3),

    CONSTRAINT "food_barcodes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_food_cache" (
    "id" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "license" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_food_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "food_catalog_gym_id_slug_key" ON "food_catalog"("gym_id", "slug");
CREATE INDEX "food_catalog_name_en_idx" ON "food_catalog"("name_en");
CREATE INDEX "nutrition_scan_logs_gym_id_member_user_id_log_date_idx" ON "nutrition_scan_logs"("gym_id", "member_user_id", "log_date");
CREATE INDEX "nutrition_scan_logs_member_user_id_created_at_idx" ON "nutrition_scan_logs"("member_user_id", "created_at");
CREATE INDEX "food_intake_entries_gym_id_member_user_id_log_date_status_idx" ON "food_intake_entries"("gym_id", "member_user_id", "log_date", "status");
CREATE INDEX "food_intake_entries_scan_id_idx" ON "food_intake_entries"("scan_id");
CREATE UNIQUE INDEX "food_barcodes_barcode_provider_key" ON "food_barcodes"("barcode", "provider");
CREATE INDEX "food_barcodes_barcode_idx" ON "food_barcodes"("barcode");
CREATE UNIQUE INDEX "external_food_cache_cache_key_key" ON "external_food_cache"("cache_key");
CREATE INDEX "external_food_cache_expires_at_idx" ON "external_food_cache"("expires_at");

ALTER TABLE "nutrition_scan_logs" ADD CONSTRAINT "nutrition_scan_logs_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_scan_logs" ADD CONSTRAINT "nutrition_scan_logs_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "food_catalog" ADD CONSTRAINT "food_catalog_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "food_nutrition" ADD CONSTRAINT "food_nutrition_food_catalog_id_fkey" FOREIGN KEY ("food_catalog_id") REFERENCES "food_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "food_recipes" ADD CONSTRAINT "food_recipes_food_catalog_id_fkey" FOREIGN KEY ("food_catalog_id") REFERENCES "food_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "food_intake_entries" ADD CONSTRAINT "food_intake_entries_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_intake_entries" ADD CONSTRAINT "food_intake_entries_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_intake_entries" ADD CONSTRAINT "food_intake_entries_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "nutrition_scan_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "food_intake_entries" ADD CONSTRAINT "food_intake_entries_food_catalog_id_fkey" FOREIGN KEY ("food_catalog_id") REFERENCES "food_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "food_barcodes" ADD CONSTRAINT "food_barcodes_food_catalog_id_fkey" FOREIGN KEY ("food_catalog_id") REFERENCES "food_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;