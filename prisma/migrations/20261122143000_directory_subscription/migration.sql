ALTER TABLE "tenants" ADD COLUMN "directory_subscription_active" BOOLEAN NOT NULL DEFAULT false;

UPDATE "tenants" SET "directory_subscription_active" = true WHERE "slug" = 'demo-gym';