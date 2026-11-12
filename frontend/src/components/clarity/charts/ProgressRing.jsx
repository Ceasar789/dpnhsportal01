// ============================================
// FILE: src/components/clarity/charts/ProgressRing.jsx
// One percentage as a ring, e.g. a student's attendance rate or a subject's
// released-score average. Presentational only; not used by the app yet.
// ============================================

import { formatNumber, percentForDrawing } from './chartMath';

// r = 100 / (2π): the circumference is 100, so a dash of N is N percent.
const R = 15.9155;

// center: optional text in place of the percentage (e.g. "8 / 15"); the
// accessible name still says the percentage.
const ProgressRing = ({ value, label, detail = '', unit = '', center = '' }) => {
  const { pct, note } = percentForDrawing(value);
  if (pct === null) {
    return <div className="x-empty">{label ? `${label}: ` : ''}No data yet</div>;
  }
  const shown = formatNumber(pct);
  const aria = `${label ? `${label}: ` : ''}${shown} percent${detail ? `, ${detail}` : ''}${note}`;
  return (
    <figure className="o-ring" style={{ margin: 0, flexDirection: 'column', gap: 6 }}>
      <svg className="x-svg" viewBox="0 0 42 42" role="img" aria-label={aria} style={{ maxWidth: 160 }}>
        <circle className="x-track" cx="21" cy="21" r={R} aria-hidden="true" />
        {pct > 0 && (
          <circle className="x-seg-ring c1" cx="21" cy="21" r={R} strokeDasharray={`${pct} ${100 - pct}`} aria-hidden="true" />
        )}
        <text className="x-ringval" x="21" y="23.5" aria-hidden="true">{center || `${shown}%`}</text>
        {unit && <text className="x-ringlbl" x="21" y="28" aria-hidden="true">{unit}</text>}
      </svg>
      {(label || detail) && (
        <figcaption style={{ textAlign: 'center', overflowWrap: 'anywhere', minWidth: 0 }} title={label || undefined}>
          {label && <b style={{ display: 'block' }}>{label}</b>}
          {detail && <span className="x-cs">{detail}</span>}
        </figcaption>
      )}
    </figure>
  );
};

export default ProgressRing;
