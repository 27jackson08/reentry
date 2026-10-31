// Dependency-free SVG line charts from the experiment CSVs.
// Usage: node scripts/experiments/plot.mjs docs/results
import { readFileSync, writeFileSync } from 'node:fs';
const [, , dir] = process.argv;
const W = 720;
const H = 400;
const PAD = { l: 64, r: 24, t: 28, b: 56 };
const COLORS = ['#f0a24b', '#6bd3a8', '#7fb0ff', '#ef6f8f', '#c9b1ff', '#ffd166'];
const FONT = 'font-family="IBM Plex Mono, ui-monospace, monospace" font-size="12"';

function csv(path) {
  const [head, ...lines] = readFileSync(path, 'utf8').trim().split('\n');
  const keys = head.split(',');
  return lines.map((l) =>
    Object.fromEntries(l.split(',').map((v, i) => [keys[i], Number.isNaN(+v) ? v : +v])),
  );
}

function chart({ title, xLabel, yLabel, series, xMax, yMax, yTicks, xTicks }) {
  const sx = (x) => PAD.l + (x / xMax) * (W - PAD.l - PAD.r);
  const sy = (y) => H - PAD.b - (y / yMax) * (H - PAD.t - PAD.b);
  let g = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  g += `<rect width="${W}" height="${H}" fill="#0f0e14"/>`;
  g += `<text x="${PAD.l}" y="18" fill="#e8e6df" ${FONT} font-size="14">${title}</text>`;
  for (const t of yTicks) {
    g += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(t)}" y2="${sy(t)}" stroke="#2a2933"/>`;
    g += `<text x="${PAD.l - 8}" y="${sy(t) + 4}" fill="#9d9ba8" ${FONT} text-anchor="end">${t}</text>`;
  }
  for (const t of xTicks) {
    g += `<text x="${sx(t)}" y="${H - PAD.b + 18}" fill="#9d9ba8" ${FONT} text-anchor="middle">${t}</text>`;
  }
  g += `<text x="${(PAD.l + W - PAD.r) / 2}" y="${H - 14}" fill="#9d9ba8" ${FONT} text-anchor="middle">${xLabel}</text>`;
  g += `<text transform="translate(16 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)" fill="#9d9ba8" ${FONT} text-anchor="middle">${yLabel}</text>`;
  series.forEach((s, i) => {
    const color = COLORS[i % COLORS.length];
    const d = s.points
      .map((p, k) => `${k ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
      .join(' ');
    g += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2"/>`;
    for (const p of s.points) {
      g += p.open
        ? `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="4" fill="#0f0e14" stroke="${color}" stroke-width="2"/>`
        : `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="3.5" fill="${color}"/>`;
    }
    g += `<text x="${W - PAD.r}" y="${PAD.t + 14 + i * 16}" fill="${color}" ${FONT} text-anchor="end">${s.name}</text>`;
  });
  return `${g}</svg>`;
}

const cm = csv(`${dir}/critical-mass.csv`);
const presets = [...new Set(cm.map((r) => r.preset))];
writeFileSync(
  `${dir}/critical-mass.svg`,
  chart({
    title: 'Reentry survival vs sheet size (0.4 mm grid, 8 s cap; open = still active at 8 s)',
    xLabel: 'sheet side (cm)',
    yLabel: 'survival (s)',
    xMax: 22,
    yMax: 8.5,
    yTicks: [0, 2, 4, 6, 8],
    xTicks: [5, 10, 15, 20],
    series: presets.map((p) => ({
      name: p,
      points: cm
        .filter((r) => r.preset === p)
        .map((r) => ({ x: r.side_cm, y: r.survival_ms / 1000, open: r.censored === 1 })),
    })),
  }),
);

const df = csv(`${dir}/defib-threshold.csv`);
const labels = [...new Set(df.map((r) => r.label))];
const strengths = [...new Set(df.map((r) => r.strength))].sort((a, b) => a - b);
writeFileSync(
  `${dir}/defib-threshold.svg`,
  chart({
    title: 'Defibrillation: fraction of shocks that terminate, over three timings',
    xLabel: 'shock amplitude (5 ms uniform current)',
    yLabel: 'terminated',
    xMax: 0.65,
    yMax: 1.05,
    yTicks: [0, 0.5, 1],
    xTicks: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    series: labels.map((label) => ({
      name: label,
      points: strengths.map((s) => {
        const rows = df.filter((r) => r.label === label && r.strength === s);
        return {
          x: s,
          y: rows.length ? rows.reduce((a, r) => a + r.terminated, 0) / rows.length : 0,
        };
      }),
    })),
  }),
);
console.log('wrote', `${dir}/critical-mass.svg`, `${dir}/defib-threshold.svg`);
