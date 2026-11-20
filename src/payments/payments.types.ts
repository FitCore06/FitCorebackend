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
};

export type MemberReceiptDto = {
  id: string;
  title: string;
  amountInr: number;
  paidAt: string;
};
