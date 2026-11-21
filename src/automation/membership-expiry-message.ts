export function formatMembershipExpiryReminderMessage(input: {
  gymName: string;
  memberName: string;
  planName: string;
  endsOn: string;
  daysUntil: number;
}): string {
  const dayLabel =
    input.daysUntil === 0
      ? 'aaj'
      : input.daysUntil === 1
        ? 'kal'
        : `${input.daysUntil} din mein`;
  return [
    `Namaste ${input.memberName}! 👋`,
    '',
    `Aapka *${input.planName}* membership *${input.gymName}* par *${endsOnLabel(input.endsOn)}* (${dayLabel}) khatam ho raha hai.`,
    '',
    'Renew karne ke liye front desk par aayein ya is message par reply karein.',
    '',
    'See you at the gym! 💪',
  ].join('\n');
}

function endsOnLabel(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}