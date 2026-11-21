export type PaymentCollectionDto = {
  bankHolderName: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  upiId: string | null;
  upiQrDataUrl: string | null;
};

export function paymentCollectionFromTenant(tenant: {
  payoutBankHolderName: string | null;
  payoutBankName: string | null;
  payoutBankAccountNumber: string | null;
  payoutBankIfsc: string | null;
  payoutUpiId: string | null;
  payoutUpiQrMimeType: string | null;
  payoutUpiQrData: string | null;
}): PaymentCollectionDto {
  const upiQrDataUrl =
    tenant.payoutUpiQrData && tenant.payoutUpiQrMimeType
      ? `data:${tenant.payoutUpiQrMimeType};base64,${tenant.payoutUpiQrData}`
      : null;
  return {
    bankHolderName: tenant.payoutBankHolderName,
    bankName: tenant.payoutBankName,
    bankAccountNumber: tenant.payoutBankAccountNumber,
    bankIfsc: tenant.payoutBankIfsc,
    upiId: tenant.payoutUpiId,
    upiQrDataUrl,
  };
}

export function hasPaymentCollection(info: PaymentCollectionDto): boolean {
  return Boolean(
    info.upiId?.trim() ||
      info.upiQrDataUrl ||
      info.bankAccountNumber?.trim() ||
      info.bankIfsc?.trim(),
  );
}