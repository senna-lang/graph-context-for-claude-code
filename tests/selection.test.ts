/**
 * tests/selection.test.ts — Unit tests for selection-tools handlers (no Obsidian API).
 */

import { describe, it, expect } from 'vitest';
import { makeSelectionToolEntries } from '../src/tools/selection-tools';
import type { SelectionStateRef } from '../src/tools/selection-tools';
import type { SelectionState, AbsolutePath, FileUrl } from '../src/protocol/types';

describe('makeSelectionToolEntries', () => {
  const fixture: SelectionState = {
    filePath: '/a.md' as unknown as AbsolutePath,
    fileUrl: 'file:///a.md' as unknown as FileUrl,
    text: 'hello',
    selection: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 5 },
      isEmpty: false,
    },
  };

  it('getCurrentSelection handler returns JSON null when stateRef.current is null', async () => {
    const stateRef: SelectionStateRef = { current: null, latest: null };
    const entries = makeSelectionToolEntries(stateRef);
    const current = entries.find(e => e.definition.name === 'getCurrentSelection')!;
    const res = await current.handler({});
    const text = res.content[0].text;
    expect(JSON.parse(text)).toBe(null);
  });

  it('getCurrentSelection handler returns selection JSON when present', async () => {
    const stateRef: SelectionStateRef = { current: fixture, latest: fixture };
    const entries = makeSelectionToolEntries(stateRef);
    const current = entries.find(e => e.definition.name === 'getCurrentSelection')!;
    const res = await current.handler({});
    const text = res.content[0].text;
    expect(JSON.parse(text).text).toBe('hello');
  });

  it('getLatestSelection returns latest non-null state JSON', async () => {
    const stateRef: SelectionStateRef = { current: null, latest: fixture };
    const entries = makeSelectionToolEntries(stateRef);
    const latest = entries.find(e => e.definition.name === 'getLatestSelection')!;
    const res = await latest.handler({});
    const text = res.content[0].text;
    expect(JSON.parse(text).text).toBe('hello');
  });

  it('getLatestSelection returns null when no selection ever occurred', async () => {
    const stateRef: SelectionStateRef = { current: null, latest: null };
    const entries = makeSelectionToolEntries(stateRef);
    const latest = entries.find(e => e.definition.name === 'getLatestSelection')!;
    const res = await latest.handler({});
    const text = res.content[0].text;
    expect(JSON.parse(text)).toBe(null);
  });
});
