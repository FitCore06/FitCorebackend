/** Fuzzy match for small local catalogs — tolerates typos (e.g. susi → sushi). */

export type FuzzyCatalogRow = {
  id: string;
  nameEn: string;
  nameHi: string | null;
};

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n]!;
}

function similarity(a: string, b: string): number {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return 0;
  if (x === y || y.includes(x) || x.includes(y)) return 1;
  const dist = levenshtein(x, y);
  const maxLen = Math.max(x.length, y.length);
  return 1 - dist / maxLen;
}

function scoreQueryAgainstName(query: string, name: string): number {
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  let best = similarity(q, n);
  for (const word of n.split(/[\s,()/-]+/)) {
    if (word.length < 2) continue;
    best = Math.max(best, similarity(q, word));
  }
  return best;
}

export function fuzzyRankCatalog<T extends FuzzyCatalogRow>(
  query: string,
  rows: T[],
  minScore = 0.58,
): T[] {
  const q = query.trim();
  if (q.length < 2) return [];

  return rows
    .map((row) => {
      const en = scoreQueryAgainstName(q, row.nameEn);
      const hi = row.nameHi ? scoreQueryAgainstName(q, row.nameHi) : 0;
      return { row, score: Math.max(en, hi) };
    })
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.row);
}