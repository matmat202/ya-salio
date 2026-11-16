/* The scrolling story: each <section class="step"> names a layout in data-step; as the
 * reader scrolls into a step, every draw's dot moves to its place in that layout (CSS
 * transitions on an SVG). Numbers in the prose are not typed in: a <b data-fact="..."> is
 * computed here from story.json's rows, and test/story.test.mjs checks each against the
 * `check` block build_story.py computed in python. Modelled on stanford-outlines/story. */
import { layout, tests, whatIf, COL, STEPS, THIRDS } from './layout.js';

const fmt = (n) => n.toLocaleString('es-MX');
const pct = (x, d = 1) => `${(100 * x).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const mill = (b) => `$${(b / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 1 })} millones`;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const fecha = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };

export function numbers(D) {
  const won = D.rows.filter((r) => r.w);
  const top = D.rows.reduce((m, r) => (r.b > m.b ? r : m));
  let run = 0, longest = [0, null];
  for (const r of D.rows) { run++; if (r.w) { if (run > longest[0]) longest = [run, r.k]; run = 0; } }
  return {
    n: D.rows.length, wins: won.length, first: D.rows[0].k, last: D.rows[D.rows.length - 1].k,
    top_b: top.b, top_k: top.k, top_w: top.w, longest: longest[0], longest_k: longest[1],
    median_win_b: won.map((r) => r.b).sort((a, b) => a - b)[Math.floor(won.length / 2)],
    ...tests(D),
  };
}

/* the cut between thirds, per era: the smallest jackpot in mid and in hi */
export const cuts = (D, e) => ['mid', 'hi'].map((t) => Math.min(...D.rows.filter((r) => r.e === e && r.t === t).map((r) => r.b)));
const byK = (D, k) => D.rows.find((r) => r.k === k);

/* "wins" -> "69". Unknown names throw: a typo must not render as blank */
export function fact(D, spec) {
  const N = numbers(D);
  switch (spec) {
    case 'n': return fmt(N.n);
    case 'wins': return fmt(N.wins);
    case 'every': return Math.round(N.n / N.wins).toString();
    case 'first_year': return byK(D, N.first).f.slice(0, 4);
    case 'top_b': return mill(N.top_b);
    case 'top_k': return fmt(N.top_k);
    case 'top_f': return fecha(byK(D, N.top_k).f);
    case 'longest': return fmt(N.longest);
    case 'longest_k': return fmt(N.longest_k);
    case 'longest_f': return fecha(byK(D, N.longest_k).f);
    case 'longest_b': return mill(byK(D, N.longest_k).b);
    case 'median_win_b': return mill(N.median_win_b);
    case 'cut_lo': return mill(cuts(D, 'B')[0]);
    case 'cut_hi': return mill(cuts(D, 'B')[1]);
    case 'w_lo': return fmt(N.w_lo);
    case 'w_hi': return fmt(N.w_hi);
    case 'n_lo': return fmt(N.n_lo);
    case 'n_hi': return fmt(N.n_hi);
    case 'rate_lo': return pct(N.rate_lo);
    case 'rate_mid': return pct(N.rate_mid);
    case 'rate_hi': return pct(N.rate_hi);
    case 'p100': return Math.round(N.p * 100).toString();
    case 'what': return fmt(whatIf(D));
    case 'crit': return fmt(N.crit);
    case 'power100': return Math.round(N.power * 100).toString();
    default: throw new Error(`unknown fact ${spec}`);
  }
}

/* labelled dots per step: (D) -> [[row, text]] */
export const LABELS = {
  saw: (D) => [[byK(D, numbers(D).top_k), mill(numbers(D).top_b)]],
  record: (D) => [[byK(D, numbers(D).top_k), `${byK(D, numbers(D).top_k).f.slice(0, 4)}: ${mill(numbers(D).top_b)}`],
    [byK(D, numbers(D).longest_k), `${numbers(D).longest} sorteos después`]],
  stack: () => [], what: () => [], due: () => [],
};
const THIRD_NAME = { lo: 'bolsa chica', mid: 'mediana', hi: 'bolsa grande' };

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

async function main() {
  const D = await (await fetch('story.json')).json();
  for (const e of document.querySelectorAll('[data-fact]')) e.textContent = fact(D, e.dataset.fact);
  for (const name of Object.keys(LABELS)) for (const [r] of LABELS[name](D)) if (!r) throw new Error(`label row missing on ${name}`);

  const steps = [...document.querySelectorAll('.step')];
  for (const s of steps) if (!STEPS[s.dataset.step]) throw new Error(`unknown step ${s.dataset.step}`);
  const plot = document.getElementById('plot');
  const svg = el('svg', { id: 'chart' });
  const gAxis = el('g', { class: 'axis' }), gDots = el('g'), gGhost = el('g', { class: 'ghosts' }), gLab = el('g', { class: 'labels' });
  svg.append(gAxis, gDots, gGhost, gLab);
  plot.append(svg);
  const dots = D.rows.map((r) => {
    const c = gDots.appendChild(el('circle', { r: 2 }));
    c.append(el('title'));
    c.firstChild.textContent = `Sorteo ${r.k} (${fecha(r.f)}): bolsa ${mill(r.b)}${r.w ? ', alguien acertó los seis' : ''}`;
    return c;
  });
  const tick = (x, y, text, cls = 'tick') => { const t = el('text', { x, y, class: cls }); t.textContent = text; gAxis.append(t); };

  let shown = -1;
  const draw = (i) => {
    const name = steps[i].dataset.step;
    const box = plot.getBoundingClientRect(), W = box.width, H = box.height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const L = layout(name, D, W, H), N = numbers(D);
    L.dots.forEach((d, k) => {
      const c = dots[k];
      c.style.transform = `translate(${d.x}px, ${d.y}px)`;
      c.setAttribute('r', d.r);
      c.style.fill = d.fill;
      c.style.opacity = d.op;
    });
    gAxis.replaceChildren();
    gGhost.replaceChildren();
    if (L.kind === 'saw') {
      // jackpot in millions up the left, years along the bottom
      const step = L.top > 400e6 ? 200e6 : 100e6;
      for (let v = 0; v <= L.top; v += step) {
        gAxis.append(el('line', { x1: 0, x2: W, y1: L.Y(v), y2: L.Y(v), class: 'grid' }));
        tick(-6, L.Y(v) + 4, v ? `${v / 1e6}` : '0', 'tick end');
      }
      tick(0, -8, 'millones de pesos');
      let year = '';
      D.rows.forEach((r, k) => {
        const y = r.f.slice(0, 4);
        if (y !== year && (+y % 4 === 0)) tick(L.X(k), H + 16, y, 'tick mid');
        year = y;
      });
    } else {
      for (const t of THIRDS) {
        tick(L.grid.cx(t), H + 16, THIRD_NAME[t], 'tick mid');
        tick(L.grid.cx(t), H + 31, pct(N[`rate_${t}`]), 'tick mid rate');
      }
      for (const c of L.ghosts) gGhost.append(el('circle', { cx: c.x, cy: c.y, r: L.r + 0.8, class: 'ghost' }));
    }
    gLab.replaceChildren();
    for (const [r, text] of LABELS[name](D)) {
      const d = L.dots[D.rows.indexOf(r)];
      gLab.append(el('circle', { cx: d.x, cy: d.y, r: d.r + 2.5, class: 'ring' }));
      const right = d.x < W * 0.6;
      const tx = el('text', { x: d.x + (right ? 1 : -1) * (d.r + 5), y: d.y + 4, class: `lab${right ? '' : ' end'}` });
      tx.textContent = text;
      gLab.append(tx);
    }
    document.body.dataset.step = i;
    window.__story = { step: i, name, shown: L.dots.filter((d) => d.op > 0).length, ghosts: L.ghosts ? L.ghosts.length : 0 };
  };

  const pick = () => {
    const line = innerHeight * 0.5;
    let i = 0;
    for (let k = 0; k < steps.length; k++) if (steps[k].getBoundingClientRect().top < line) i = k;
    if (i !== shown) { shown = i; draw(i); }
  };
  addEventListener('scroll', pick, { passive: true });
  addEventListener('resize', () => { shown = -1; pick(); });
  pick();
}

export { COL };

if (typeof document !== 'undefined') main().catch((e) => {
  document.body.classList.add('failed');
  document.getElementById('err').textContent = String(e.message || e);
  console.error(e);
});
