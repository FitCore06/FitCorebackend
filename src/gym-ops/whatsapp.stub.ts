export type WhatsAppStubStatus = 'sent' | 'skipped' | 'failed';

export type WhatsAppStubResult = {
  status: WhatsAppStubStatus;
  detail: string;
  phone: string | null;
};

function normalizeIndianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length >= 10) return digits;
  return null;
}

/** Demo stub — logs payload; wire Meta Cloud API / Twilio in production. */
export function sendWhatsAppBillStub(
  phone: string | null | undefined,
  message: string,
): WhatsAppStubResult {
  if (!phone?.trim()) {
    return {
      status: 'skipped',
      detail: 'Member has no phone — add phone on profile to enable WhatsApp bill.',
      phone: null,
    };
  }
  const normalized = normalizeIndianPhone(phone);
  if (!normalized) {
    return {
      status: 'failed',
      detail: 'Phone number format is invalid for WhatsApp.',
      phone: phone,
    };
  }
  console.log(
    `[whatsapp-stub] to=+${normalized}\n---\n${message}\n---\n(demo: open https://wa.me/${normalized}?text=${encodeURIComponent(message.slice(0, 500))} for manual test)`,
  );
  return {
    status: 'sent',
    detail: `Bill queued to +${normalized} (WhatsApp provider stub)`,
    phone: `+${normalized}`,
  };
}

export function paymentMethodLabel(method: string): string {
  const map: Record<string, string> = {
    cash: 'Cash',
    upi: 'UPI',
    card: 'Card',
    net_banking: 'Net banking',
    other: 'Other',
  };
  return map[method] ?? method;
}

export function formatSupplementBillMessage(input: {
  gymName: string;
  billNumber: string;
  memberName: string;
  items: { productName: string; quantity: number; unitPriceInr: number }[];
  totalInr: number;
  paymentMethod: string;
  notes?: string | null;
}): string {
  const lines = input.items.map(
    (i) =>
      `• ${i.productName} × ${i.quantity} — ₹${(i.quantity * i.unitPriceInr).toLocaleString('en-IN')}`,
  );
  const parts = [
    `*${input.gymName}* — supplement purchase`,
    `Bill: *${input.billNumber}*`,
    `Member: ${input.memberName}`,
    '',
    '*Items*',
    ...lines,
    '',
    `*Total: ₹${input.totalInr.toLocaleString('en-IN')}*`,
    `Paid via: ${paymentMethodLabel(input.paymentMethod)}`,
  ];
  if (input.notes?.trim()) {
    parts.push('', `Note: ${input.notes.trim()}`);
  }
  parts.push('', 'Thank you for shopping with us! 💪');
  return parts.join('\n');
}