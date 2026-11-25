export type SupplementBillDeliveryStatus = 'sent' | 'skipped' | 'failed';

export type SupplementBillDeliveryResult = {
  status: SupplementBillDeliveryStatus;
  detail: string;
  phone: string | null;
};

export function normalizeIndianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length >= 10) return digits;
  return null;
}

async function sendWhatsAppCloudText(
  toDigits: string,
  body: string,
): Promise<{ ok: boolean; detail: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) {
    return { ok: false, detail: 'WhatsApp Cloud API not configured' };
  }
  const version = process.env.WHATSAPP_GRAPH_VERSION?.trim() || 'v21.0';
  const res = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toDigits,
        type: 'text',
        text: { body: body.slice(0, 4096) },
      }),
    },
  );
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    return { ok: false, detail: `WhatsApp API ${res.status}: ${detail}` };
  }
  return { ok: true, detail: 'Sent via WhatsApp Cloud API' };
}

/** Stub logs; sends via Meta when WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID are set. */
export async function sendSupplementBillDelivery(
  phone: string | null | undefined,
  message: string,
): Promise<SupplementBillDeliveryResult> {
  if (!phone?.trim()) {
    return {
      status: 'skipped',
      detail: 'Member has no phone — add phone on profile to enable bill delivery.',
      phone: null,
    };
  }
  const normalized = normalizeIndianPhone(phone);
  if (!normalized) {
    return {
      status: 'failed',
      detail: 'Phone number format is invalid.',
      phone: phone,
    };
  }
  const cloudConfigured = Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() &&
      process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
  );
  const cloud = await sendWhatsAppCloudText(normalized, message);
  if (cloud.ok) {
    return {
      status: 'sent',
      detail: cloud.detail,
      phone: `+${normalized}`,
    };
  }
  if (cloudConfigured) {
    return {
      status: 'failed',
      detail: cloud.detail,
      phone: `+${normalized}`,
    };
  }

  console.log(`[supplement-bill-stub] to=+${normalized}\n---\n${message}\n---`);
  return {
    status: 'sent',
    detail: `Bill logged locally (stub). ${cloud.detail}`,
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