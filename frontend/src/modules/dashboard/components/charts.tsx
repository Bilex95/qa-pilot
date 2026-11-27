import type { ReactNode } from "react";

/** Horizontal bars, one row per item, with the value written at the end (locked design: .hbars). The bar width is relative to the largest. */
export function HBars({ rows, label }: { rows: { key: string; label: ReactNode; text: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars" role="list" aria-label={label}>
      {rows.map((r) => (
        <div key={r.key} className="hbar" role="listitem" title={`${r.text}: ${r.value}`}>
          <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{r.label}</span>
          <div className="track"><div className="fill" style={{ width: `${(100 * r.value) / max}%` }} /></div>
          <span className="v">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Opened (solid line) and closed (dashed) per day. Every day has a hit area whose native tooltip reads "14 Nov: 3 opened, 2 closed". */
export function LineChart({ points, label, w = 640, h = 220 }: { points: { date: string; opened: number; closed: number }[]; label: string; w?: number; h?: number }) {
  const pad = { l: 32, r: 76, t: 12, b: 28 };
  const n = points.length;
  const max = Math.max(1, ...points.map((p) => Math.max(p.opened, p.closed))) + 1;
  const x = (i: number) => pad.l + (n > 1 ? (i * (w - pad.l - pad.r)) / (n - 1) : 0);
  const y = (v: number) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const path = (pick: (p: { opened: number; closed: number }) => number) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join("");
  const ticks = [0, Math.round(max / 2), max];
  const last = points[n - 1];
  const crowded = last ? Math.abs(y(last.closed) - y(last.opened)) < 14 : false;
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid-l" x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end">{t}</text>
        </g>
      ))}
      {[0, Math.floor(n / 2), n - 1].filter((i, k, all) => n > 0 && all.indexOf(i) === k).map((i) => (
        <text key={i} x={x(i)} y={h - 8} textAnchor="middle">{dayLabel(points[i]!.date)}</text>
      ))}
      <path d={path((p) => p.opened)} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" />
      <path d={path((p) => p.closed)} fill="none" stroke="var(--series-2)" strokeWidth="2" strokeLinejoin="round" strokeDasharray="6 3" />
      {last ? (
        <>
          <circle cx={x(n - 1)} cy={y(last.opened)} r="4" fill="var(--series-1)" stroke="#fff" strokeWidth="2" />
          <circle cx={x(n - 1)} cy={y(last.closed)} r="4" fill="var(--series-2)" stroke="#fff" strokeWidth="2" />
          <text x={x(n - 1) + 10} y={y(last.opened) + 4}>Opened {last.opened}</text>
          <text x={x(n - 1) + 10} y={y(last.closed) + (crowded ? 18 : 4)}>Closed {last.closed}</text>
        </>
      ) : null}
      {points.map((p, i) => (
        <rect key={p.date} x={x(i) - 8} y={pad.t} width="16" height={h - pad.t - pad.b} fill="transparent">
          <title>{`${dayLabel(p.date)}: ${p.opened} opened, ${p.closed} closed`}</title>
        </rect>
      ))}
    </svg>
  );
}

export function TrendLegend() {
  return (
    <div className="legend">
      <span><i style={{ background: "var(--series-1)" }} />Opened (solid)</span>
      <span><i style={{ background: "var(--series-2)" }} />Closed (dashed)</span>
    </div>
  );
}

/** Vertical bars of a pass rate per run, with the 80% gate (D-014) marked. */
export function VBars({ rows, label, w = 520, h = 200 }: { rows: { key: string; name: string; value: number }[]; label: string; w?: number; h?: number }) {
  const pad = { l: 32, r: 8, t: 16, b: 30 };
  const bw = (w - pad.l - pad.r) / Math.max(1, rows.length);
  const y = (v: number) => pad.t + (h - pad.t - pad.b) * (1 - v / 100);
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      {[0, 50, 100].map((t) => (
        <g key={t}>
          <line className="grid-l" x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end">{t}%</text>
        </g>
      ))}
      <line className="axis" x1={pad.l} x2={w - pad.r} y1={y(80)} y2={y(80)} strokeDasharray="3 3" />
      <text x={w - pad.r} y={y(80) - 4} textAnchor="end">80% gate</text>
      {rows.map((r, i) => {
        const bx = pad.l + i * bw + bw * 0.22;
        const bwid = bw * 0.56;
        const top = y(r.value);
        return (
          <g key={r.key}>
            <path d={`M${bx},${y(0)} V${top + 4} Q${bx},${top} ${bx + 4},${top} H${bx + bwid - 4} Q${bx + bwid},${top} ${bx + bwid},${top + 4} V${y(0)} Z`} fill="var(--chart-bar)">
              <title>{`${r.name}: ${r.value}% pass`}</title>
            </path>
            <text x={bx + bwid / 2} y={top - 5} textAnchor="middle" style={{ fontWeight: 700, fill: "var(--ink)" }}>{r.value}%</text>
            <text x={bx + bwid / 2} y={h - 10} textAnchor="middle">{r.key}</text>
          </g>
        );
      })}
    </svg>
  );
}
