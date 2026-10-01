import { describe, it, expect } from 'vitest';
import { pageWindow } from './pagination';

describe('pageWindow', () => {
  it('lists every page when there are few', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('returns a single page for one page and nothing for zero', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 0)).toEqual([]);
  });

  it('collapses the tail behind an ellipsis near the start', () => {
    expect(pageWindow(1, 19)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 19]);
    expect(pageWindow(3, 19)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 19]);
  });

  it('collapses the head behind an ellipsis near the end', () => {
    expect(pageWindow(19, 19)).toEqual([1, 'ellipsis', 15, 16, 17, 18, 19]);
    expect(pageWindow(17, 19)).toEqual([1, 'ellipsis', 15, 16, 17, 18, 19]);
  });

  it('shows both ellipses in the middle', () => {
    expect(pageWindow(10, 19)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 19]);
  });

  it('clamps an out-of-range current page', () => {
    expect(pageWindow(99, 19)).toEqual([1, 'ellipsis', 15, 16, 17, 18, 19]);
    expect(pageWindow(-4, 19)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 19]);
  });
});
