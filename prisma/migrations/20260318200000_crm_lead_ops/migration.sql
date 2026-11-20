-- AlterTable
ALTER TABLE "crm_leads" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "referred_by" TEXT,
ADD COLUMN     "assigned_user_id" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "crm_leads_gym_id_stage_idx" ON "crm_leads"("gym_id", "stage");

-- AddForeignKey
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;