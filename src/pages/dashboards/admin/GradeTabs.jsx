// ============================================
// FILE: src/pages/dashboards/admin/GradeTabs.jsx
// The Grade 7 … Grade 12 strip shared by Teaching Load and Schedules.
//
// The count beside each grade is the point, not decoration: filtering a
// screen to one grade hides the other five, so without it "is Grade 9 done?"
// costs a tab switch. With it, the whole year is readable at a glance.
// ============================================

import React from 'react';
import { GRADE_LEVELS } from '../../../lib/academicRules';

// counts: { 'Grade 7': 8, … }. A grade missing from the map shows no badge,
// which is different from showing 0 — used while the counts are still loading.
const GradeTabs = ({ value, onChange, counts }) => (
  <div className="grade-tabs">
    {GRADE_LEVELS.map(g => {
      const n = counts?.[g];
      return (
        <button key={g} type="button"
          className={`grade-tab${value === g ? ' active' : ''}`}
          onClick={() => onChange(g)}>
          {g}
          {typeof n === 'number' && (
            <span className={`grade-tab-count${n === 0 ? ' empty' : ''}`}>{n}</span>
          )}
        </button>
      );
    })}
  </div>
);

export default GradeTabs;
