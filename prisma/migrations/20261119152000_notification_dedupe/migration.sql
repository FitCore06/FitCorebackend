ALTER TABLE "gym_notifications" ADD COLUMN "dedupe_key" TEXT;
CREATE UNIQUE INDEX "gym_notifications_dedupe_key_key" ON "gym_notifications"("dedupe_key");
