// Student page header, the same pattern as the teacher Grading and Attendance
// tabs: a plain h1, a muted subtitle, and an optional 44px refresh button.
import { RefreshCw } from 'lucide-react';

const PageHeader = ({ title, subtitle, onRefresh, refreshLabel, children }) => (
  <header className="flex flex-wrap items-start justify-between gap-3 mb-6">
    <div className="min-w-0">
      <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{title}</h1>
      {subtitle && <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {children}
      {onRefresh && (
        <button type="button" onClick={onRefresh} aria-label={refreshLabel}
          className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 border"
          style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', backgroundColor: 'var(--card-bg)' }}>
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  </header>
);

export default PageHeader;
