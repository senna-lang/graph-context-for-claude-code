/**
 * tests/context-tools.test.ts — Unit tests for tools/context-tools handlers using injected fake deps.
 */

import { describe, it, expect } from 'vitest';
import { makeContextToolEntries } from '../src/tools/context-tools';
import type { ContextToolsDeps } from '../src/tools/context-tools';
import type { SelectionStateRef } from '../src/tools/selection-tools';
import type { EnrichedContext, SelectionState, AbsolutePath, FileUrl } from '../src/protocol/types';

// Fixtures
const fakeEnrichedContext: EnrichedContext = {
  headingPath: [],
  frontmatter: null,
  expandedText: '',
  linkedSummaries: [],
  backlinks: [],
  truncated: { expandedText: false, totalContext: false, backlinks: false },
};

const fakeSelectionState: SelectionState = {
  filePath: '/vault/note.md' as unknown as AbsolutePath,
  fileUrl: 'file:///vault/note.md' as unknown as FileUrl,
  text: 'hi',
  selection: {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 2 },
    isEmpty: false,
  },
};

// Helper to create mock deps
function makeDeps(stateRef: SelectionStateRef): ContextToolsDeps {
  return {
    stateRef,
    buildContext: () => fakeEnrichedContext,
    readNote: (p) => (p === '/vault/note.md' ? 'hi' : null),
    basePath: '/vault',
  };
}

describe('getSelectionWithContext', () => {
  it('returns JSON null when stateRef.current is null', async () => {
    const stateRef: SelectionStateRef = { current: null, latest: null };
    const entries = makeContextToolEntries(makeDeps(stateRef));
    const tool = entries.find((e) => e.definition.name === 'getSelectionWithContext')!;
    const res = await tool.handler({});

    const text = res.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed).toBeNull();
  });

  it('returns state with context field', async () => {
    const stateRef: SelectionStateRef = {
      current: fakeSelectionState,
      latest: fakeSelectionState,
    };
    const entries = makeContextToolEntries(makeDeps(stateRef));
    const tool = entries.find((e) => e.definition.name === 'getSelectionWithContext')!;
    const res = await tool.handler({});

    const text = res.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.context).toBeDefined();
    expect(parsed.text).toBe('hi');
  });

  it('context matches injected buildContext output', async () => {
    const stateRef: SelectionStateRef = {
      current: fakeSelectionState,
      latest: fakeSelectionState,
    };
    const entries = makeContextToolEntries(makeDeps(stateRef));
    const tool = entries.find((e) => e.definition.name === 'getSelectionWithContext')!;
    const res = await tool.handler({});

    const text = res.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.context.truncated.backlinks).toBe(false);
  });
});

describe('getNoteExpanded', () => {
  it('isError true for path outside basePath', async () => {
    const stateRef: SelectionStateRef = { current: null, latest: null };
    const entries = makeContextToolEntries(makeDeps(stateRef));
    const tool = entries.find((e) => e.definition.name === 'getNoteExpanded')!;
    const res = await tool.handler({ path: '/etc/passwd' });

    expect(res.isError).toBe(true);
  });

  it('isError true when readNote returns null', async () => {
    const stateRef: SelectionStateRef = { current: null, latest: null };
    const entries = makeContextToolEntries(makeDeps(stateRef));
    const tool = entries.find((e) => e.definition.name === 'getNoteExpanded')!;
    const res = await tool.handler({ path: '/vault/missing.md' });

    expect(res.isError).toBe(true);
  });

  it('returns JSON with path+context when note exists', async () => {
    const stateRef: SelectionStateRef = { current: null, latest: null };
    const entries = makeContextToolEntries(makeDeps(stateRef));
    const tool = entries.find((e) => e.definition.name === 'getNoteExpanded')!;
    const res = await tool.handler({ path: '/vault/note.md' });

    const text = res.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.path).toBe('/vault/note.md');
    expect(parsed.context).toBeDefined();
  });
});
