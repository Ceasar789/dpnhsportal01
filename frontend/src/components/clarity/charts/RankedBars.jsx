// ============================================
// FILE: src/components/clarity/charts/RankedBars.jsx
// Percentages ranked high to low, e.g. a student's released-score average
// per subject ({ label, value: percent or null }). A row with no value is
// listed last as "No released scores" rather than drawn as zero.
// Presentational only; not used by the app yet.
// ============================================

import { formatNumber, percentForDrawing } from './chartMath';

const RankedBars = ({ rows = [], label = '', emptyText = 'No released scores' }) => {
  const items = (rows || []).map(r => ({ label: String(r?.label ?? ''), ...percentForDrawing(r?.value) }));
  if (!items.length) {
    return <div className="x-empty">{label ? `${label}: ` : ''}No data yet</div>;
  }
  const ranked = [...items].sort((a, b) => {
    if (a.pct === null) return b.pct === null ? 0 : 1;
    if (b.pct === null) return -1;
    return b.pct - a.pct;
  });
  const words = ranked.map(r => (r.pct === null ? `${r.label} ${emptyText.toLowerCase()}`
    : `${r.label} ${formatNumber(r.pct)} percent${r.note}`)).join(', ');

  return (
    <div className="x-rank" role="img" aria-label={`${label ? `${label}: ` : ''}${words}`}>
      {ranked.map((r, i) => (
        <div className="r" key={`${r.label}-${i}`}>
          <span title={r.label} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{r.label}</span>
          <div className="tr" aria-hidden="true">
            {r.pct !== null && r.pct > 0 && <i className="c1" style={{ width: `${r.pct}%` }} />}
          </div>
          <span className="v">{r.pct === null ? '—' : `${formatNumber(r.pct)}%`}</span>
        </div>
      ))}
    </div>
  );
};

export default RankedBars;
