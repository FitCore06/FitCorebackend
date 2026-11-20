-- CreateTable
CREATE TABLE "registration_invites" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "gym_id" TEXT,
    "email" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registration_invites_token_hash_key" ON "registration_invites"("token_hash");

-- CreateIndex
CREATE INDEX "registration_invites_gym_id_idx" ON "registration_invites"("gym_id");

-- CreateIndex
CREATE INDEX "registration_invites_kind_used_at_idx" ON "registration_invites"("kind", "used_at");

-- AddForeignKey
ALTER TABLE "registration_invites" ADD CONSTRAINT "registration_invites_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;