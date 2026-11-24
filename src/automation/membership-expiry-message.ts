export function formatMembershipExpiryReminderMessage(input: {
  gymName: string;
  memberName: string;
  planName: string;
  endsOn: string;
  daysUntil: number;
  paymentPendingApproval?: boolean;
}): string {
  const dayLabel =
    input.daysUntil < 0
      ? 'expire ho chuka hai'
      : input.daysUntil === 0
        ? 'aaj'
        : input.daysUntil === 1
          ? 'kal'
          : `${input.daysUntil} din mein`;
  const lines = [
    `Namaste ${input.memberName}! 👋`,
    '',
    input.daysUntil < 0
      ? `Aapka *${input.planName}* membership *${input.gymName}* par *${endsOnLabel(input.endsOn)}* ko khatam ho chuka hai. Renew karke access banaye rakhein.`
      : `Aapka *${input.planName}* membership *${input.gymName}* par *${endsOnLabel(input.endsOn)}* (${dayLabel}) khatam ho raha hai.`,
    '',
  ];
  if (input.paymentPendingApproval) {
    lines.push(
      'Aapka renewal payment gym approval ka wait kar raha hai. Owner jaldi *Mark paid* karega.',
      '',
    );
  } else {
    lines.push(
      'Renew karne ke liye Billing / front desk par payment karein. Owner approve karte hi plan active ho jayega.',
      '',
    );
  }
  lines.push('See you at the gym! 💪');
  return lines.join('\n');
}

function endsOnLabel(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}