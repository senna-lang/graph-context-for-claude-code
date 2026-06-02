/**
 * tests/lru.test.ts — Unit tests for util/lru LRUMap: eviction, touch-on-get, has does not touch, delete, size.
 */
import { describe, it, expect } from 'vitest';
import { LRUMap } from '../src/util/lru';

describe('LRUMap', () => {
  it('evicts oldest when capacity exceeded', () => {
    const lru = new LRUMap<string, number>(2);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);

    expect(lru.has('a')).toBe(false);
    expect(lru.has('b')).toBe(true);
    expect(lru.has('c')).toBe(true);
    expect(lru.size).toBe(2);
  });

  it('get() touches key so it survives eviction', () => {
    const lru = new LRUMap<string, number>(2);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.get('a');
    lru.set('c', 3);

    expect(lru.has('a')).toBe(true);
    expect(lru.has('b')).toBe(false);
    expect(lru.has('c')).toBe(true);
  });

  it('has() does not touch recency', () => {
    const lru = new LRUMap<string, number>(2);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.has('a');
    lru.set('c', 3);

    expect(lru.has('a')).toBe(false);
    expect(lru.has('b')).toBe(true);
    expect(lru.has('c')).toBe(true);
  });

  it('delete removes and returns boolean', () => {
    const lru = new LRUMap<string, number>(3);
    lru.set('a', 1);

    expect(lru.delete('a')).toBe(true);
    expect(lru.delete('a')).toBe(false);
    expect(lru.size).toBe(0);
  });

  it('size reflects entries', () => {
    const lru = new LRUMap<string, number>(5);
    lru.set('a', 1);
    lru.set('b', 2);

    expect(lru.size).toBe(2);

    lru.delete('a');

    expect(lru.size).toBe(1);
  });

  it('get returns value and undefined for missing', () => {
    const lru = new LRUMap<string, number>(2);
    lru.set('a', 1);

    expect(lru.get('a')).toBe(1);
    expect(lru.get('z')).toBeUndefined();
  });
});
