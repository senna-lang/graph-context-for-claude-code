/**
 * obsidian/workspace-tracker.ts — Tracks active file and selection state.
 *
 * Selection is read from CodeMirror 6 via an editor extension (updateListener),
 * NOT from DOM 'selectionchange' + Editor.getSelection(): in CM6 the latter
 * returns an empty string during/after a drag-select (observed live), so it
 * cannot satisfy the "current selection" requirement. The CM6 ViewUpdate carries
 * the authoritative editor state (doc + selection ranges), which we convert to
 * 0-origin {line, character}. active-leaf-change keeps the active file tracked on
 * file switches even without editor interaction.
 */

import { Plugin } from 'obsidian';
import { EditorView } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import type { SelectionState, Position, EnrichedContext } from '../protocol/types';
import type { SelectionStateRef } from '../tools/selection-tools';
import { toAbsolutePath, toFileUrl } from './paths';

export type TrackerOptions = {
  plugin: Plugin;
  stateRef: SelectionStateRef;
  onSelectionChanged: (state: SelectionState) => void;
  basePath: string;
  buildContext?: (state: SelectionState) => EnrichedContext;
};

/**
 * Registers an active-leaf-change listener (file switches) and a CodeMirror 6
 * editor extension that reports live selection changes.
 */
export function registerWorkspaceTracker(opts: TrackerOptions): void {
  opts.plugin.registerEvent(
    opts.plugin.app.workspace.on('active-leaf-change', () => updateFromActiveFile(opts))
  );

  opts.plugin.registerEditorExtension([
    EditorView.updateListener.of((update: ViewUpdate) => {
      if (!update.selectionSet && !update.docChanged && !update.focusChanged) return;
      updateFromEditorState(opts, update.state);
    }),
  ]);

  // Apply the extension to already-open editors without requiring a reload.
  opts.plugin.app.workspace.updateOptions();
}

/**
 * Builds SelectionState from a CodeMirror EditorState (authoritative selection).
 */
function updateFromEditorState(opts: TrackerOptions, state: EditorState): void {
  const file = opts.plugin.app.workspace.getActiveFile();
  if (!file) return;

  const filePath = toAbsolutePath(opts.basePath, file.path);
  const fileUrl = toFileUrl(filePath);

  const range = state.selection.main;
  const text = state.sliceDoc(range.from, range.to);
  const fromLine = state.doc.lineAt(range.from);
  const toLine = state.doc.lineAt(range.to);
  const start: Position = { line: fromLine.number - 1, character: range.from - fromLine.from };
  const end: Position = { line: toLine.number - 1, character: range.to - toLine.from };

  let selectionState: SelectionState = {
    filePath,
    fileUrl,
    text,
    selection: { start, end, isEmpty: range.empty },
  };

  if (opts.buildContext) {
    selectionState = { ...selectionState, context: opts.buildContext(selectionState) };
  }

  opts.stateRef.current = selectionState;
  if (text !== '') opts.stateRef.latest = selectionState;
  opts.onSelectionChanged(selectionState);
}

/**
 * On file switch, record the active file with an empty selection. The CM6
 * updateListener will refine this with the real cursor/selection once the editor
 * reports an update.
 */
function updateFromActiveFile(opts: TrackerOptions): void {
  const file = opts.plugin.app.workspace.getActiveFile();
  if (!file) return;

  const filePath = toAbsolutePath(opts.basePath, file.path);
  const fileUrl = toFileUrl(filePath);

  let selectionState: SelectionState = {
    filePath,
    fileUrl,
    text: '',
    selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 }, isEmpty: true },
  };

  if (opts.buildContext) {
    selectionState = { ...selectionState, context: opts.buildContext(selectionState) };
  }

  opts.stateRef.current = selectionState;
  opts.onSelectionChanged(selectionState);
}
