import { describe, expect, it } from 'vitest';
import { inAppPath } from './inAppPath';

const ORIGIN = 'https://portal.example';

describe('inAppPath', () => {
  it('follows relative and same-origin URLs', () => {
    expect(inAppPath('/student-dashboard/tasks', ORIGIN)).toBe('/student-dashboard/tasks');
    expect(inAppPath('/student-dashboard/tasks?subject=x#top', ORIGIN)).toBe('/student-dashboard/tasks?subject=x#top');
    expect(inAppPath('https://portal.example/student-dashboard', ORIGIN)).toBe('/student-dashboard');
  });

  it('ignores other sites and unsafe schemes', () => {
    expect(inAppPath('https://evil.example/x', ORIGIN)).toBeNull();
    expect(inAppPath('//evil.example/x', ORIGIN)).toBeNull();
    expect(inAppPath('javascript:alert(1)', ORIGIN)).toBeNull();
    expect(inAppPath('data:text/html,hi', ORIGIN)).toBeNull();
    expect(inAppPath('', ORIGIN)).toBeNull();
    expect(inAppPath(null, ORIGIN)).toBeNull();
  });
});
