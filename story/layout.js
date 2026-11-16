/* Where each draw's dot sits on each step of the story. Pure: no DOM, so
 * test/story.test.mjs runs every layout at several plot sizes.
 *
 * One dot per played draw since the 56-ball urn. On a "saw" step it sits at its date and its
 * jackpot (the sawtooth: the bolsa climbs, someone hits six, it restarts). On a "stack" step
 * the draws are sorted into three columns by jackpot size, lo / mid / hi within their era,
 * and packed into a grid with the won draws at the bottom, so each column's red is its share.
 */
const memo = (f) => { const m = new WeakMap(); return (D) => { if (!m.has(D)) m.set(D, f(D)); return m.get(D); }; };
export const COL = { ink: '#16202a', won: '#b8322a', what: '#1f5f8b', dim: '#9aa1aa' };
export const THIRDS = ['lo', 'mid', 'hi'];

/* counts per third, the chance tail and the power: the same arithmetic as build_story.py */
function comb(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
export const tailHyper = (x, total, nHi, nLo) => {
  let s = 0;
  for (let j = x; j <= Math.min(total, nHi); j++) s += comb(nHi, j) * comb(nLo, total - j);
  return s / comb(nHi + nLo, total);
};
export const tailBinom = (c, n, q) => { let s = 0; for (let j = c; j <= n; j++) s += comb(n, j) * q ** j * (1 - q) ** (n - j); return s; };

export const tests = memo((D) => {
  const o = {};
  for (const t of THIRDS) {
    const g = D.rows.filter((r) => r.t === t);
    o[`n_${t}`] = g.length; o[`w_${t}`] = g.filter((r) => r.w).length; o[`rate_${t}`] = o[`w_${t}`] / g.length;
  }
  o.ratio = o.rate_hi / o.rate_lo;
  const total = o.w_lo + o.w_hi;
  o.p = tailHyper(o.w_hi, total, o.n_hi, o.n_lo);
  let c = 0;
  while (tailHyper(c, total, o.n_hi, o.n_lo) > D.alpha) c++;
  o.crit = c;
  o.power = tailBinom(c, total, (D.k * o.n_hi) / (D.k * o.n_hi + o.n_lo));
  return o;
});

/* the top-third wins a K-times-likelier world would expect, given the bottom third's rate */
export const whatIf = (D) => Math.round(D.k * tests(D).rate_lo * tests(D).n_hi);

const top = memo((D) => D.rows.reduce((m, r) => Math.max(m, r.b), 0));
/* each third's dots in grid order: won first, then by date, so the red sits at the bottom */
const order = memo((D) => {
  const at = new Map();
  for (const t of THIRDS) D.rows.map((r, i) => [r, i]).filter(([r]) => r.t === t)
    .sort(([a, i], [b, j]) => b.w - a.w || i - j).forEach(([, i], k) => at.set(i, k));
  return at;
});

/* a grid for the biggest third inside one column: pitch, columns per grid */
export function grid(D, w, h) {
  const n = Math.max(...THIRDS.map((t) => tests(D)[`n_${t}`])) + whatIf(D);
  const cw = w / 3 * 0.8;
  let p = Math.sqrt((cw * h) / n);
  while (Math.floor(cw / p) * Math.floor(h / p) < n) p *= 0.97;
  const C = Math.floor(cw / p);
  const x0 = (t) => (THIRDS.indexOf(t) + 0.1) * (w / 3) + (cw - C * p) / 2;
  const cell = (t, k) => ({ x: x0(t) + (k % C + 0.5) * p, y: h - (Math.floor(k / C) + 0.5) * p });
  return { p, C, cw, cell, cx: (t) => (THIRDS.indexOf(t) + 0.5) * (w / 3) };
}

export const STEPS = { saw: 'saw', record: 'saw', stack: 'stack', what: 'stack', due: 'saw' };

export function layout(name, D, w, h) {
  const kind = STEPS[name];
  if (kind === 'saw') {
    const T = top(D), n = D.rows.length;
    const X = (i) => 6 + (i / (n - 1)) * (w - 12), Y = (b) => h - 6 - (b / T) * (h - 12);
    const dots = D.rows.map((r, i) => {
      const lit = name === 'record' ? r.w && (r.k === D.check.top_k || r.k === D.check.longest_k) : r.w;
      return { x: X(i), y: Y(r.b), r: r.w ? (lit && name === 'record' ? 5 : 3.2) : 1.5,
               fill: r.w ? COL.won : COL.dim, op: r.w ? (name === 'record' && !lit ? 0.45 : 1) : 0.55 };
    });
    return { kind, dots, X, Y, top: T };
  }
  const g = grid(D, w, h), at = order(D);
  const r = Math.max(1, g.p * 0.36);
  const dots = D.rows.map((row, i) => {
    const c = g.cell(row.t, at.get(i));
    return { x: c.x, y: c.y, r, fill: row.w ? COL.won : COL.dim, op: row.w ? 1 : 0.5 };
  });
  const ghosts = [];
  if (name === 'what') for (let k = tests(D).w_hi; k < whatIf(D); k++) ghosts.push(g.cell('hi', k));
  return { kind, dots, grid: g, ghosts, r };
}
