// ============================================
// FILE: src/components/clarity/charts/Donut.jsx
// Shares of a whole as a donut with the total in the centre and a legend,
// e.g. the admin role distribution ({ label, value: count }). Shares use the
// app's largest-remainder rounding, so the legend adds up to 100.
// Presentational only; not used by the app yet.
// ============================================

import { wholePercents } from '../../../lib/percentages';
import { countForDrawing, formatNumber, seriesColour } from './chartMath';

const R = 15.9155;

// gap (optional): a thin space between segments, in circumference units (the
// circle is 100 long; 0.5 is about 2px at the 180px size). 0, the default,
// draws exactly as before. A single visible segment never gets a gap.
// size (optional): the ring's width in px (default 180, as before).
// showPercent (optional, default true): false shows only the count in the
// legend; the screen-reader summary keeps the percentages either way.
const Donut = ({ segments = [], label = '', totalLabel = 'total', gap = 0, size, showPercent = true }) => {
  const rows = (segments || [])
    .map(s => ({ label: String(s?.label ?? ''), value: countForDrawing(s?.value) }))
    .filter(s => s.value !== null);
  const total = rows.reduce((sum, s) => sum + s.value, 0);
  if (!rows.length || total <= 0) {
    return <div className="x-empty">{label ? `${label}: ` : ''}No data yet</div>;
  }
  const percents = wholePercents(rows.map(s => s.value));
  const shares = rows.map(s => (s.value / total) * 100);
  // Each arc starts where the previous ones end.
  const arcs = rows.map((s, i) => ({
    ...s, i, share: shares[i], pct: percents[i],
    offset: shares.slice(0, i).reduce((sum, n) => sum + n, 0),
  }));
  const visible = arcs.filter(a => a.share > 0);
  const g = Number(gap) > 0 && visible.length > 1 ? Number(gap) : 0;
  const words = arcs.map(a => `${a.label} ${formatNumber(a.value)} (${a.pct} percent)`).join(', ');
  const aria = `${label ? `${label}: ` : ''}${formatNumber(total)} ${totalLabel}. ${words}`;

  return (
    <figure style={{ margin: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
      <svg className="x-svg" viewBox="0 0 42 42" role="img" aria-label={aria} style={size ? { maxWidth: size, flex: `0 1 ${size}px` } : { maxWidth: 180, flex: '0 1 180px' }}>
        <circle className="x-track" cx="21" cy="21" r={R} aria-hidden="true" />
        {visible.map(a => (g
          ? (
            <circle key={a.i} className="x-seg-ring" cx="21" cy="21" r={R} aria-hidden="true"
              style={{ stroke: seriesColour(a.i) }}
              strokeDasharray={`${Math.max(a.share - g, 0)} ${100 - Math.max(a.share - g, 0)}`} strokeDashoffset={-(a.offset + g / 2)} />
          ) : (
            <circle key={a.i} className="x-seg-ring" cx="21" cy="21" r={R} aria-hidden="true"
              style={{ stroke: seriesColour(a.i) }}
              strokeDasharray={`${a.share} ${100 - a.share}`} strokeDashoffset={-a.offset} />
          )))}
        <text className="x-ringval" x="21" y="23" aria-hidden="true">{formatNumber(total)}</text>
        <text className="x-ringlbl" x="21" y="27.5" aria-hidden="true">{totalLabel}</text>
      </svg>
      <ul className="x-legend">
        {arcs.map(a => (
          <li key={a.i}>
            <span className="x-sw" style={{ background: seriesColour(a.i) }} aria-hidden="true" />
            <span title={a.label} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{a.label}</span>
            <b>{showPercent ? `${formatNumber(a.value)} · ${a.pct}%` : formatNumber(a.value)}</b>
          </li>
        ))}
      </ul>
    </figure>
  );
};

export default Donut;
