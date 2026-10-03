// ============================================
// FILE: src/pages/dashboards/admin/GradeTabs.jsx
// The Grade 7 … Grade 12 strip shared by Teaching Load and Schedules.
//
// The count beside each grade is the point, not decoration: filtering a
// screen to one grade hides the other five, so without it "is Grade 9 done?"
// costs a tab switch. With it, the whole year is readable at a glance.
// ============================================

import { GRADE_LEVELS } from '../../../lib/academicRules';

// counts: { 'Grade 7': 8, … }. A grade missing from the map shows no badge,
// which is different from showing 0 — used while the counts are still loading.
// `unit` is what the number counts, singular. Without it the pill is a
// bare figure: this component is used by two tabs and counts a different
// thing in each - scheduled periods on Schedules, teaching assignments on
// Teaching Load - and an admin who had just made a section in every grade
// read "Grade 8 0" as "my section is missing". The caption above the strip
// says the same thing visibly, because an aria-label does not help a
// sighted user and a title does not exist on touch.
const GradeTabs = ({ value, onChange, counts, unit = 'item' }) => (
  <div className="grade-tabs">
    {GRADE_LEVELS.map(g => {
      const n = counts?.[g];
      const named = typeof n === 'number'
        ? `${g}, ${n} ${unit}${n === 1 ? '' : 's'}`
        : g;
      return (
        <button key={g} type="button"
          className={`grade-tab${value === g ? ' active' : ''}`}
          aria-label={named}
          title={named}
          onClick={() => onChange(g)}>
          {g}
          {typeof n === 'number' && (
            <span className={`grade-tab-count${n === 0 ? ' empty' : ''}`} aria-hidden="true">{n}</span>
          )}
        </button>
      );
    })}
  </div>
);

export default GradeTabs;
