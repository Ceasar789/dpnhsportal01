// ============================================
// FILE: src/pages/dashboards/registrar/shared/constants.js
// STATUS_MAP, DOCUMENT_TYPES
// Split from the original monolithic RegistrarDashboard.jsx (2,158 lines)
// ============================================

export const STATUS_MAP = {
  pending:    { bg: '#FEF3C7', color: '#92400E', label: 'Pending'    },
  approved:   { bg: '#DCFCE7', color: '#15803D', label: 'Approved'   },
  incomplete: { bg: '#FEF9C3', color: '#854D0E', label: 'Incomplete' },
  rejected:   { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected'   },
  verified:   { bg: '#DCFCE7', color: '#15803D', label: 'Verified'   },
  active:     { bg: '#DCFCE7', color: '#15803D', label: 'Active'     },
  inactive:   { bg: '#F1F5F9', color: '#64748B', label: 'Inactive'   },
  dropped:    { bg: '#FEE2E2', color: '#991B1B', label: 'Dropped'    },
  graduated:  { bg: '#DBEAFE', color: '#1E40AF', label: 'Graduated'  },
  suspended:  { bg: '#FEF3C7', color: '#92400E', label: 'Suspended'  },
};

export const DOCUMENT_TYPES = [
  { key: 'reportCard',    label: 'Form 138 (Report Card)',      required: true },
  { key: 'birthCert',     label: 'PSA Birth Certificate',       required: true },
  { key: 'goodMoral',     label: 'Good Moral Certificate',      required: true },
  { key: 'idPhoto',       label: '2x2 ID Photo (2 copies)',     required: true },
  { key: 'medicalCert',   label: 'Medical Certificate',         required: false },
  { key: 'certEnroll',    label: 'Certificate of Enrollment',   required: false },
  { key: 'transferCred',  label: 'Transfer Credentials',        required: false },
  { key: 'tor',           label: 'Transcript of Records',       required: false },
];

