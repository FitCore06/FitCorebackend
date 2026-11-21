CREATE TABLE "member_body_weight_logs" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "log_date" TEXT NOT NULL,
    "weight_kg" DOUBLE PRECISION NOT NULL,
    "target_kg" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_body_weight_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "member_body_weight_logs_member_user_id_gym_id_log_date_key" ON "member_body_weight_logs"("member_user_id", "gym_id", "log_date");

CREATE INDEX "member_body_weight_logs_gym_id_log_date_idx" ON "member_body_weight_logs"("gym_id", "log_date");

ALTER TABLE "member_body_weight_logs" ADD CONSTRAINT "member_body_weight_logs_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_body_weight_logs" ADD CONSTRAINT "member_body_weight_logs_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;