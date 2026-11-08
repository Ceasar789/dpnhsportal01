import { describe, expect, it } from 'vitest';

// The teacher /grades destination is called "Grading" everywhere a teacher sees it.
const sources = import.meta.glob([
  './DashboardLayout.jsx', './SideBar.jsx', './MobileDrawer.jsx',
  '../../pages/dashboards/teacher/TeacherDashboard.jsx', '../../pages/dashboards/teacher/tabs/OverviewTab.jsx',
  '../../pages/dashboards/teacher/worksheets/EssayReviewLab.jsx', '../../pages/dashboards/teacher/tabs/GradesTab.jsx',
], { query: '?raw', import: 'default', eager: true });

describe('Grading label', () => {
  it('reads all seven files', () => { expect(Object.keys(sources)).toHaveLength(7); });

  it('no file still says "Worksheet Scores"', () => {
    expect(Object.entries(sources).filter(([, text]) => text.includes('Worksheet Scores')).map(([file]) => file)).toEqual([]);
  });

  it.each(['./DashboardLayout.jsx', './SideBar.jsx', './MobileDrawer.jsx', '../../pages/dashboards/teacher/TeacherDashboard.jsx'])(
    '%s labels the /grades route "Grading"', file => {
      const line = sources[file].split('\n').find(text => text.includes("'/teacher-dashboard/grades'"));
      expect(line).toContain("label: 'Grading'");
    });

  it('the Overview button and the Essay Review Lab link say Grading', () => {
    expect(sources['../../pages/dashboards/teacher/tabs/OverviewTab.jsx']).toContain('aria-hidden="true" />Grading</Btn>');
    expect(sources['../../pages/dashboards/teacher/worksheets/EssayReviewLab.jsx']).toContain('>Back to Grading</Btn>');
  });
});
