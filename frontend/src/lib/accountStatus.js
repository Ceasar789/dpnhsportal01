export const normalizeAccountStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  return ['active', 'inactive', 'suspended', 'archived'].includes(normalized)
    ? normalized
    : 'unknown';
};

export const isActiveAccount = (status) => normalizeAccountStatus(status) === 'active';
