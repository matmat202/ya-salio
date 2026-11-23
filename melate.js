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
  // A row's BOLSA is the jackpot announced for the NEXT draw: row 2677 says $639.5M and draw
  // 2678 paid 639.500.000,00; row 3680 says $505.4M and draw 3681 paid 505.842.255,65
  // (loterianacional.com results, checked 2026-11-16). So `next` and `peakDraw` name the draw
  // that played for it; a reset row is the winning draw itself.
  function bolsa(draws, pools, price) {
    const [first, N] = pools[pools.length - 1], odds = comb(N, 6), breakEven = price * odds;
    const m = draws.filter((d) => d[0] >= first && d[3]);
    const last = m[m.length - 1], above = m.filter((d) => d[3] >= breakEven);
    const peak = m.reduce((a, d) => (d[3] > a[3] ? d : a), m[0]);
    const resets = [], rises = [], won = [];   // won[k]: the jackpot resets[k] paid (the row before it announced it)
    for (let i = 1; i < m.length; i++) {
      if (m[i][3] < m[i - 1][3]) { resets.push(m[i]); won.push(m[i - 1][3]); } else if (m[i][3] > m[i - 1][3]) rises.push(m[i][3] - m[i - 1][3]);
    }
    rises.sort((a, b) => a - b);
    const runs = [];   // consecutive draws above break-even
    for (const d of above) { const r = runs[runs.length - 1]; if (r && d[0] === r[r.length - 1][0] + 1) r.push(d); else runs.push([d]); }
    const lastReset = resets[resets.length - 1];
    return { N, odds, price, breakEven, last, next: last[0] + 1, peakDraw: peak[0] + 1, perTicket: last[3] / odds, above, runs, peak, resets,
             everyDraws: m.length / resets.length, sinceReset: lastReset ? last[0] - lastReset[0] : null, lastReset, lastWon: won[won.length - 1],
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

  // What a ticket wins in one draw. Melate pays nine categories: 6 hits; then 5, 4, 3 and 2
  // hits, each split by whether the ticket also holds the adicional (d[4]). The last four pay a
  // fixed amount in pesos, the first five a share of that draw's sales. Table and amounts from
  // loterianacional.gob.mx/Melate/Melate, "Niveles de premiación" (read 2026-11-23; the
  // unofficial loterianacional.com said $32.26 for 8.ª, the official page $32.25). 1 hit +
  // adicional pays nothing.
  const PRIZES = [[6, false, null], [5, true, null], [5, false, null], [4, true, null], [4, false, null],
    [3, true, 161.29], [3, false, 43.01], [2, true, 32.25], [2, false, 26.88]];

  // The two side games drawn the same night against the same six, from the same official page:
  // Revancha pays 6, 5 and 4 hits a share of sales and 3 and 2 hits a fixed amount; Revanchita
  // pays only six. No adicional in either. [hits, pesos or null], indexed by place - 1.
  const OTRAS = { revancha: [[6, null], [5, null], [4, null], [3, 26.80], [2, 10.75]], revanchita: [[6, null]] };
  function prizeOtra(game, six, nums) {
    const k = sameBall(six, nums), i = OTRAS[game].findIndex(([h]) => h === k);
    return { k, cat: i + 1, amount: i < 0 ? null : OTRAS[game][i][1] };
  }
  function prize(six, d) {
    const k = sameBall(six, d[2]), ad = d[4] != null && six.includes(d[4]);
    const i = PRIZES.findIndex(([h, a]) => h === k && (a === ad || h === 6));
    return { k, ad, cat: i < 0 ? 0 : i + 1, amount: i < 0 ? null : PRIZES[i][2] };
  }

  // A fixed ticket under today's nine categories in every draw it could have been played in:
  // how many draws each category (cat[1..9]; cat[0] = no prize), and how many prizes a ticket
  // drawn at random would expect over the same draws: P(2+ hits) = 1 - P(0) - P(1) in each urn.
  // Counts, not pesos: the fixed amounts are today's, and old draws paid in other money.
  function prizeHistory(draws, pools, six) {
    const cat = new Array(PRIZES.length + 1).fill(0);
    let tot = 0, expected = 0;
    const pAny = (N) => 1 - (comb(N - 6, 6) + 6 * comb(N - 6, 5)) / comb(N, 6);
    for (const d of draws) {
      const N = poolOf(pools, d[0]);
      if (Math.max(...six) > N) continue;
      tot++; expected += pAny(N); cat[prize(six, d).cat]++;
    }
    const won = tot - cat[0];
    return { cat, tot, won, expected, fixed: cat.slice(6).reduce((a, b) => a + b, 0) };
  }

  // A returning player checks now and then, and Melate draws three times a week: the top card
  // lists the ticket against each of the last n draws, newest first, so none of the missed ones
  // is skipped. `pesos` sums only the fixed amounts (2-3 hits); a 4+ hit is flagged, not priced.
  // `otras` (MELATE.otras, the newest draws of each side game) adds, per row, what the same six
  // got in Revancha and Revanchita that night, matched by draw number (null where not held);
  // their prizes are counted apart, since not every ticket plays them.
  function recent(draws, six, n, otras) {
    const rows = draws.slice(-n).reverse().map((d) => {
      const o = {};
      for (const g of Object.keys(otras || {})) { const e = otras[g].find((x) => x[0] === d[0]); o[g] = e ? prizeOtra(g, six, e[2]) : null; }
      return { draw: d, ...prize(six, d), otras: o };
    });
    const won = rows.filter((r) => r.cat);
    const owon = rows.flatMap((r) => Object.values(r.otras).filter((p) => p && p.cat));
    return { rows, won: won.length, pesos: won.reduce((s, r) => s + (r.amount || 0), 0), big: won.some((r) => r.amount == null),
             otrasWon: owon.length, otrasPesos: owon.reduce((s, p) => s + (p.amount || 0), 0), otrasBig: owon.some((p) => p.amount == null) };
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

  const api = { prize, recent, PRIZES, OTRAS, prizeOtra, prizeHistory, parseTicket, schedule, bolsa, comb, poolOf, repeats, expectedRepeats, replay, STRATEGIES, myTicket, hasConsecutive, pConsecutive, freq, sameBall };
  if (typeof module !== 'undefined') module.exports = api; else root.Melate = api;
})(this);
