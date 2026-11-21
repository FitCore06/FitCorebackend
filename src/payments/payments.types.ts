export type PaymentStatus = 'paid' | 'pending' | 'refunded';

export type PaymentDto = {
  id: string;
  memberName: string;
  memberEmail: string;
  title: string;
  amountInr: number;
  refundedAmountInr: number;
  method: string;
  status: PaymentStatus;
  at: string;
  hasProof: boolean;
};

export type MemberReceiptDto = {
  id: string;
  title: string;
  amountInr: number;
  paidAt: string;
};

export type MemberPaymentItemDto = {
  id: string;
  title: string;
  amountInr: number;
  method: string;
  status: PaymentStatus;
  at: string;
  hasProof: boolean;
};
