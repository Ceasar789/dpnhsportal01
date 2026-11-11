// ============================================
// FILE: src/components/clarity/charts/StackedBar.jsx
// A breakdown of counts as one stacked bar with a legend, e.g. attendance
// Present / Late / Absent / Excused, or Grading statuses. `tone` picks a
// status token (ok, wa, er, in, mu); otherwise the series colours are used.
// Presentational only; not used by the app yet.
// ============================================

import { wholePercents } from '../../../lib/percentages';
import { TONES, countForDrawing, formatNumber, seriesColour } from './chartMath';

const StackedBar = ({ segments = [], label = '', unit = '' }) => {
  const rows = (segments || [])
    .map((s, i) => ({ label: String(s?.label ?? ''), value: countForDrawing(s?.value), colour: TONES[s?.tone] || seriesColour(i), i }))
    .filter(s => s.value !== null);
  const total = rows.reduce((sum, s) => sum + s.value, 0);
  if (!rows.length || total <= 0) {
    return <div className="x-empty">{label ? `${label}: ` : ''}No data yet</div>;
  }
  const percents = wholePercents(rows.map(s => s.value));
  const unitText = unit ? ` ${unit}` : '';
  const words = rows.map((s, k) => `${s.label} ${formatNumber(s.value)} (${percents[k]} percent)`).join(', ');
  const aria = `${label ? `${label}: ` : ''}${formatNumber(total)}${unitText} in total. ${words}`;

  return (
    <figure style={{ margin: 0 }}>
      <div className="x-stack" role="img" aria-label={aria}>
        {rows.filter(s => s.value > 0).map(s => (
          <i key={s.i} aria-hidden="true" style={{ width: `${(s.value / total) * 100}%`, background: s.colour }} />
        ))}
      </div>
      <ul className="x-legend" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '8px 16px', marginTop: 12 }}>
        {rows.map((s, k) => (
          <li key={s.i}>
            <span className="x-sw" style={{ background: s.colour }} aria-hidden="true" />
            <span title={s.label} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{s.label}</span>
            <b>{`${formatNumber(s.value)} · ${percents[k]}%`}</b>
          </li>
        ))}
      </ul>
    </figure>
  );
};

export default StackedBar;
