import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSnapshots, loadSnapshot, saveSnapshot } from './overviewSnapshot';

describe('Today offline snapshot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('keeps the last loaded overview per trip, with when it was saved', () => {
    saveSnapshot('t1', { code: 'K7Q2ZP' }, 1000);
    saveSnapshot('t2', { code: 'OTHER' }, 2000);
    expect(loadSnapshot('t1')).toEqual({ at: 1000, data: { code: 'K7Q2ZP' } });
    expect(loadSnapshot('missing')).toBeNull();
  });

  it('forgets every trip on sign-out, and leaves other storage alone', () => {
    localStorage.setItem('unrelated', 'x');
    saveSnapshot('t1', { code: 'K7Q2ZP' });
    clearSnapshots();
    expect(loadSnapshot('t1')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('x');
  });

  it('works without storage (private windows, blocked site data)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => saveSnapshot('t1', { code: 'x' })).not.toThrow();
    expect(loadSnapshot('t1')).toBeNull();
  });

  it('ignores a corrupt entry', () => {
    localStorage.setItem('tripwise:overview:t1', '{not json');
    expect(loadSnapshot('t1')).toBeNull();
  });
});
