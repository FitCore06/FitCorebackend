-- CreateTable
CREATE TABLE "session_bookings" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "trainer_user_id" TEXT NOT NULL,
    "start_at_label" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_status_events" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_bookings_gym_id_idx" ON "session_bookings"("gym_id");

-- CreateIndex
CREATE INDEX "session_bookings_member_user_id_idx" ON "session_bookings"("member_user_id");

-- CreateIndex
CREATE INDEX "session_bookings_trainer_user_id_idx" ON "session_bookings"("trainer_user_id");

-- CreateIndex
CREATE INDEX "booking_status_events_booking_id_idx" ON "booking_status_events"("booking_id");

-- AddForeignKey
ALTER TABLE "session_bookings" ADD CONSTRAINT "session_bookings_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_bookings" ADD CONSTRAINT "session_bookings_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_bookings" ADD CONSTRAINT "session_bookings_trainer_user_id_fkey" FOREIGN KEY ("trainer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_events" ADD CONSTRAINT "booking_status_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "session_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;