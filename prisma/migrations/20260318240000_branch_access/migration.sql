ALTER TABLE "member_check_ins" ADD COLUMN "branch_id" TEXT;

CREATE TABLE "user_branch_access" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_branch_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_branch_access_user_id_branch_id_key"
  ON "user_branch_access"("user_id", "branch_id");
CREATE INDEX "user_branch_access_branch_id_idx"
  ON "user_branch_access"("branch_id");
CREATE INDEX "member_check_ins_gym_id_branch_id_idx"
  ON "member_check_ins"("gym_id", "branch_id");

ALTER TABLE "member_check_ins"
  ADD CONSTRAINT "member_check_ins_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_branch_access"
  ADD CONSTRAINT "user_branch_access_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_branch_access"
  ADD CONSTRAINT "user_branch_access_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
