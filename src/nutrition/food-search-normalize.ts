/** Normalizes common food search typos and aliases before catalog/USDA lookup. */
export function normalizeFoodSearchQuery(raw: string): string {
  let q = raw.trim().replace(/\s+/g, ' ');
  if (!q) return q;

  const phraseFixes: [RegExp, string][] = [
    [/\bpani\s+purri\b/gi, 'pani puri'],
    [/\bpani\s+poori\b/gi, 'pani puri'],
    [/\bpanipuri\b/gi, 'pani puri'],
    [/\bpanipoori\b/gi, 'pani puri'],
    [/\bgol\s+gappa\b/gi, 'pani puri'],
    [/\bgolgappa\b/gi, 'pani puri'],
    [/\bgol\s+gappe\b/gi, 'pani puri'],
    [/\bphuchka\b/gi, 'pani puri'],
    [/\bchicken\s+biriyani\b/gi, 'chicken biryani'],
    [/\bmango\s+achar\b/gi, 'mango pickle'],
    [/\bachaar\b/gi, 'achar'],
  ];

  for (const [pattern, replacement] of phraseFixes) {
    q = q.replace(pattern, replacement);
  }

  const tokenFixes: Record<string, string> = {
    purri: 'puri',
    poori: 'puri',
    puris: 'puri',
    biriyani: 'biryani',
    briyani: 'biryani',
    pickel: 'pickle',
    pickels: 'pickle',
    achar: 'pickle',
    achaar: 'pickle',
    susi: 'sushi',
    shushi: 'sushi',
    suhi: 'sushi',
    cusine: 'cuisine',
  };

  q = q
    .split(' ')
    .map((token) => {
      const lower = token.toLowerCase();
      return tokenFixes[lower] ?? token;
    })
    .join(' ');

  return q;
}

export function foodSearchTokens(normalizedQuery: string): string[] {
  return normalizedQuery
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}