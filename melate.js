/* Pure functions over the draw history; the page and test/model_test.cjs both use them. */
(function (root) {
  const comb = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
  const poolOf = (pools, n) => pools.filter(([first]) => n >= first).pop()[1];

  // Every pair of draws whose six numbers are identical.
  function repeats(draws) {
    const seen = new Map(), out = [];
    for (const d of draws) {
      const key = d[2].join('-');
      if (seen.has(key)) out.push([seen.get(key), d]); else seen.set(key, d);
    }
    return out;
  }

  // Expected number of identical pairs if every draw is fair: a pair from pools a<=b matches
  // with probability 1/C(b,6) (any combo from the small pool is also a combo of the big one).
  function expectedRepeats(draws, pools) {
    const count = new Map();
    for (const d of draws) { const p = poolOf(pools, d[0]); count.set(p, (count.get(p) || 0) + 1); }
    const ps = [...count.keys()].sort((a, b) => a - b);
    let e = 0;
    ps.forEach((a, i) => ps.slice(i).forEach((b) => {
      const pairs = a === b ? count.get(a) * (count.get(a) - 1) / 2 : count.get(a) * count.get(b);
      e += pairs / comb(b, 6);
    }));
    return e;
  }

  const sameBall = (a, b) => a.filter((x) => b.includes(x)).length;

  // Play one ticket-choosing strategy on every draw of the current pool (after a warm-up).
  function replay(draws, pools, strategy, warm = 100) {
    const N = pools[pools.length - 1][1], first = pools[pools.length - 1][0];
    const modern = draws.filter((d) => d[0] >= first);
    const hits = [0, 0, 0, 0, 0, 0, 0];
    for (let i = warm; i < modern.length; i++) hits[sameBall(strategy(modern.slice(0, i), N), modern[i][2])]++;
    const tot = hits.reduce((a, b) => a + b, 0);
    return { hits, tot, mean: hits.reduce((s, v, k) => s + k * v, 0) / tot,
             three: (hits[3] + hits[4] + hits[5] + hits[6]) / tot, expected: 36 / N };
  }

  function freq(hist, N, last) {
    const c = new Array(N + 1).fill(0);
    for (const d of last ? hist.slice(-last) : hist) for (const x of d[2]) c[x]++;
    return c;
  }
  const top = (c, dir) => c.map((v, x) => [v, x]).slice(1).sort((a, b) => dir * (b[0] - a[0]) || a[1] - b[1]).slice(0, 6).map((t) => t[1]);
  const STRATEGIES = {
    calientes: (h, N) => top(freq(h, N), 1),
    calientes50: (h, N) => top(freq(h, N, 50), 1),
    frios: (h, N) => top(freq(h, N), -1),
    repetir: (h) => h[h.length - 1][2],
    seguidos: () => [1, 2, 3, 4, 5, 6],
  };

  // A fixed ticket against every draw it could have been played in (same pool size or larger).
  function myTicket(draws, pools, six) {
    const hits = [0, 0, 0, 0, 0, 0, 0], best = { k: -1 };
    for (const d of draws) {
      if (Math.max(...six) > poolOf(pools, d[0])) continue;
      const k = sameBall(six, d[2]); hits[k]++;
      if (k > best.k) Object.assign(best, { k, draw: d });
    }
    return { hits, best, tot: hits.reduce((a, b) => a + b, 0) };
  }

  const hasConsecutive = (six) => six.some((x, i) => i && x - six[i - 1] === 1);
  const pConsecutive = (N) => 1 - comb(N - 5, 6) / comb(N, 6);

  // The jackpot in the current urn: what it puts into one ticket, the size at which the jackpot
  // alone would repay the ticket, and how often it restarted (fell from one draw to the next,
  // i.e. someone hit six). Draws with no recorded bolsa are skipped, not read as zero.
  function bolsa(draws, pools, price) {
    const [first, N] = pools[pools.length - 1], odds = comb(N, 6), breakEven = price * odds;
    const m = draws.filter((d) => d[0] >= first && d[3]);
    const last = m[m.length - 1], above = m.filter((d) => d[3] >= breakEven);
    const peak = m.reduce((a, d) => (d[3] > a[3] ? d : a), m[0]);
    const resets = [], rises = [];
    for (let i = 1; i < m.length; i++) {
      if (m[i][3] < m[i - 1][3]) resets.push(m[i]); else if (m[i][3] > m[i - 1][3]) rises.push(m[i][3] - m[i - 1][3]);
    }
    rises.sort((a, b) => a - b);
    const runs = [];   // consecutive draws above break-even
    for (const d of above) { const r = runs[runs.length - 1]; if (r && d[0] === r[r.length - 1][0] + 1) r.push(d); else runs.push([d]); }
    const lastReset = resets[resets.length - 1];
    return { N, odds, price, breakEven, last, perTicket: last[3] / odds, above, runs, peak, resets,
             everyDraws: m.length / resets.length, sinceReset: lastReset ? last[0] - lastReset[0] : null,
             medianRise: rises[Math.floor(rises.length / 2)], series: m.map((d) => [d[0], d[3]]) };
  }

  // Melate is drawn Wednesday, Friday and Sunday at 21:00, Mexico City (no gap in the CSV since
  // mid-2021). Given the newest draw this page holds and today's date there, list the draw days
  // since that the page cannot know about (today's is not one: it has not been drawn yet, or its
  // result is hours old), and the next draw day from today on. Dates are ISO strings, read as UTC.
  const DRAW_DAYS = [0, 3, 5];
  function schedule(lastIso, todayIso) {
    const t = new Date(lastIso + 'T00:00:00Z'), today = new Date(todayIso + 'T00:00:00Z'), iso = () => t.toISOString().slice(0, 10);
    const missed = [];
    for (t.setUTCDate(t.getUTCDate() + 1); t < today; t.setUTCDate(t.getUTCDate() + 1)) if (DRAW_DAYS.includes(t.getUTCDay())) missed.push(iso());
    if (t < today) t.setTime(today.getTime());
    while (!DRAW_DAYS.includes(t.getUTCDay())) t.setUTCDate(t.getUTCDate() + 1);
    return { missed, next: iso() };
  }

  // A saved or shared ticket ("8-12-15-18-20-34", from the URL hash or localStorage): six
  // distinct whole numbers in 1..n, sorted, or null. Anything else is ignored, never half-used.
  function parseTicket(str, n) {
    const parts = String(str || '').split(/[^0-9]+/).filter(Boolean);
    if (parts.length !== 6) return null;
    const six = parts.map(Number).sort((a, b) => a - b);
    if (six.some((x, i) => !Number.isInteger(x) || x < 1 || x > n || six[i - 1] === x)) return null;
    return six;
  }

  const api = { parseTicket, schedule, bolsa, comb, poolOf, repeats, expectedRepeats, replay, STRATEGIES, myTicket, hasConsecutive, pConsecutive, freq, sameBall };
  if (typeof module !== 'undefined') module.exports = api; else root.Melate = api;
})(this);
