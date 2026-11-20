-- CreateTable
CREATE TABLE "trainer_profiles" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "specialty" TEXT NOT NULL DEFAULT 'General fitness',
    "floor_status" TEXT NOT NULL DEFAULT 'on-floor',
    "live_status" TEXT NOT NULL DEFAULT 'available',
    "live_detail" TEXT,
    "live_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gym_membership_plans" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duration_label" TEXT NOT NULL,
    "price_inr" INTEGER NOT NULL,

    CONSTRAINT "gym_membership_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trial_leads" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "trial_ends_label" TEXT NOT NULL,
    "follow_up_label" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assigned_trainer_name" TEXT NOT NULL,

    CONSTRAINT "trial_leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crm_leads" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "next_action" TEXT NOT NULL,

    CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gym_equipment" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "next_service_label" TEXT NOT NULL,

    CONSTRAINT "gym_equipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gym_notifications" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gym_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trainer_payroll_runs" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "trainer_name" TEXT NOT NULL,
    "base_inr" INTEGER NOT NULL,
    "commission_inr" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "trainer_payroll_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gym_automation_rules" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "gym_automation_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gym_report_exports" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "last_run_label" TEXT NOT NULL,

    CONSTRAINT "gym_report_exports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trainer_messages" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "trainer_user_id" TEXT NOT NULL,
    "sender_role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "member_weekly_workouts" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "plan_json" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_weekly_workouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trainer_profiles_gym_id_user_id_key" ON "trainer_profiles"("gym_id", "user_id");
CREATE INDEX "trainer_profiles_gym_id_idx" ON "trainer_profiles"("gym_id");

CREATE INDEX "gym_membership_plans_gym_id_idx" ON "gym_membership_plans"("gym_id");
CREATE INDEX "trial_leads_gym_id_idx" ON "trial_leads"("gym_id");
CREATE INDEX "crm_leads_gym_id_idx" ON "crm_leads"("gym_id");
CREATE INDEX "gym_equipment_gym_id_idx" ON "gym_equipment"("gym_id");
CREATE INDEX "gym_notifications_gym_id_user_id_read_idx" ON "gym_notifications"("gym_id", "user_id", "read");
CREATE INDEX "trainer_payroll_runs_gym_id_idx" ON "trainer_payroll_runs"("gym_id");
CREATE INDEX "gym_automation_rules_gym_id_idx" ON "gym_automation_rules"("gym_id");
CREATE INDEX "gym_report_exports_gym_id_idx" ON "gym_report_exports"("gym_id");
CREATE INDEX "trainer_messages_gym_id_member_user_id_trainer_user_id_idx" ON "trainer_messages"("gym_id", "member_user_id", "trainer_user_id");
CREATE UNIQUE INDEX "member_weekly_workouts_gym_id_member_user_id_source_key" ON "member_weekly_workouts"("gym_id", "member_user_id", "source");

ALTER TABLE "trainer_profiles" ADD CONSTRAINT "trainer_profiles_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trainer_profiles" ADD CONSTRAINT "trainer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gym_membership_plans" ADD CONSTRAINT "gym_membership_plans_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trial_leads" ADD CONSTRAINT "trial_leads_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gym_notifications" ADD CONSTRAINT "gym_notifications_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gym_notifications" ADD CONSTRAINT "gym_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trainer_payroll_runs" ADD CONSTRAINT "trainer_payroll_runs_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gym_automation_rules" ADD CONSTRAINT "gym_automation_rules_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gym_report_exports" ADD CONSTRAINT "gym_report_exports_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trainer_messages" ADD CONSTRAINT "trainer_messages_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trainer_messages" ADD CONSTRAINT "trainer_messages_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trainer_messages" ADD CONSTRAINT "trainer_messages_trainer_user_id_fkey" FOREIGN KEY ("trainer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_weekly_workouts" ADD CONSTRAINT "member_weekly_workouts_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_weekly_workouts" ADD CONSTRAINT "member_weekly_workouts_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;