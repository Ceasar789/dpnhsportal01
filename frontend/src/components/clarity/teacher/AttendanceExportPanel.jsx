// U-T6: "Export to Excel" for the selected advisory section. Default range: the
// current month (Manila); the teacher can choose another range. A failed read
// makes no file and says so (never a partial or empty sheet passed off as real).
import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { philippineDateKey } from '../../../lib/calendarRules';
import { downloadXlsx } from '../../../lib/xlsx';
import { attendanceFileName, attendanceWorkbook, monthRange, rangeProblem, readAttendanceRange } from './attendanceExport';

export default function AttendanceExportPanel({ section, students }) {
  const [range, setRange] = useState(() => monthRange(philippineDateKey()));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ tone: '', text: '' });
  const [from, to] = range;

  const exportNow = async () => {
    if (busy) return;
    const problem = rangeProblem(from, to);
    if (problem) { setMessage({ tone: 'error', text: problem }); return; }
    setBusy(true);
    setMessage({ tone: '', text: '' });
    try {
      const records = await readAttendanceRange(section.id, from, to);
      const bytes = attendanceWorkbook({ section: section.name, grade: section.grade_level, schoolYear: section.school_year, from, to, students, records });
      downloadXlsx(bytes, attendanceFileName({ grade: section.grade_level, section: section.name, from, to }));
      setMessage({ tone: 'ok', text: records.length ? 'The Excel file was downloaded.' : 'The Excel file was downloaded. No attendance was recorded in this range.' });
    } catch {
      setMessage({ tone: 'error', text: 'The attendance could not be loaded, so no file was made. Check your connection and try again.' });
    }
    setBusy(false);
  };

  return (
    <section className="x-card x-pad x-tat-export" aria-labelledby="x-tat-export-h">
      <h2 id="x-tat-export-h" className="x-ct">Export to Excel</h2>
      <p className="x-cs">One row per student with P, L, A or E for each recorded day, totals and the attendance rate.</p>
      <div className="x-tat-pick">
        <label className="x-label">From
          <input type="date" className="x-input" value={from} max={to || undefined} onChange={e => setRange([e.target.value, to])} />
        </label>
        <label className="x-label">To
          <input type="date" className="x-input" value={to} min={from || undefined} onChange={e => setRange([from, e.target.value])} />
        </label>
        <button type="button" className="x-btn pri" onClick={exportNow} aria-busy={busy || undefined}>
          <FileSpreadsheet size={16} aria-hidden="true" /> {busy ? 'Preparing…' : 'Export to Excel'}
        </button>
      </div>
      {message.text && <p role={message.tone === 'error' ? 'alert' : 'status'} className="x-cs x-tat-export-msg">{message.text}</p>}
    </section>
  );
}
