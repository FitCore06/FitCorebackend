-- Gym payout details for owners (bank, UPI, QR)
ALTER TABLE "tenants"
ADD COLUMN "payout_bank_holder_name" TEXT,
ADD COLUMN "payout_bank_name" TEXT,
ADD COLUMN "payout_bank_account_number" TEXT,
ADD COLUMN "payout_bank_ifsc" TEXT,
ADD COLUMN "payout_upi_id" TEXT,
ADD COLUMN "payout_upi_qr_mime_type" TEXT,
ADD COLUMN "payout_upi_qr_data" TEXT;