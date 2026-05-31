import { describe, test, expect } from 'vitest';
import {
  formatMoneyFromMillions,
  formatPercent,
  toBulletList,
  getDomain,
  pickMarketAnalysis,
  ensureArray,
} from '../src/lib/format.js';

describe('formatMoneyFromMillions', () => {
  test('formats trillions / billions / millions / thousands', () => {
    expect(formatMoneyFromMillions(2_000_000)).toBe('$2.00T');
    expect(formatMoneyFromMillions(12_700)).toBe('$12.7B');
    expect(formatMoneyFromMillions(500)).toBe('$500M');
    expect(formatMoneyFromMillions(0.5)).toBe('$500K');
  });

  test('returns an em dash for null / NaN', () => {
    expect(formatMoneyFromMillions(null)).toBe('—');
    expect(formatMoneyFromMillions('abc')).toBe('—');
  });
});

describe('formatPercent', () => {
  test('formats to one decimal place', () => {
    expect(formatPercent(12.345)).toBe('12.3%');
  });
  test('handles missing values', () => {
    expect(formatPercent(null)).toBe('—');
  });
});

describe('toBulletList', () => {
  test('passes arrays through, dropping falsy entries', () => {
    expect(toBulletList(['a', '', 'b'])).toEqual(['a', 'b']);
  });
  test('splits strings on semicolons / newlines / bullets', () => {
    expect(toBulletList('one; two\nthree')).toEqual(['one', 'two', 'three']);
  });
  test('returns an empty array for null', () => {
    expect(toBulletList(null)).toEqual([]);
  });
});

describe('getDomain', () => {
  test('strips protocol and www', () => {
    expect(getDomain('https://www.example.com/path')).toBe('example.com');
  });
  test('handles bare domains', () => {
    expect(getDomain('example.org')).toBe('example.org');
  });
});

describe('ensureArray', () => {
  test('wraps scalars and preserves arrays', () => {
    expect(ensureArray('x')).toEqual(['x']);
    expect(ensureArray(['x'])).toEqual(['x']);
    expect(ensureArray(null)).toEqual([]);
  });
});

describe('pickMarketAnalysis', () => {
  test('prefers a row that actually has data', () => {
    const rows = [
      { market_size: null, five_year_projection: null, growth_per_year: null },
      { market_size: 100, five_year_projection: 200, growth_per_year: 5 },
    ];
    expect(pickMarketAnalysis(rows)).toBe(rows[1]);
  });
  test('returns null when there are no rows', () => {
    expect(pickMarketAnalysis([])).toBeNull();
  });
});
