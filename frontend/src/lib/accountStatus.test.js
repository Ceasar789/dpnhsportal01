import { describe, expect, it } from 'vitest';
import { isActiveAccount, normalizeAccountStatus } from './accountStatus';

describe('account status eligibility', () => {
  it('accepts only an explicitly active status', () => {
    expect(isActiveAccount('active')).toBe(true);
    expect(isActiveAccount(' Active ')).toBe(true);
    for (const status of ['inactive', 'suspended', 'archived', 'unknown', '', null, undefined]) {
      expect(isActiveAccount(status)).toBe(false);
    }
  });

  it('normalizes supported values and fails unknown values closed', () => {
    expect(normalizeAccountStatus('SUSPENDED')).toBe('suspended');
    expect(normalizeAccountStatus('future-state')).toBe('unknown');
  });
});
