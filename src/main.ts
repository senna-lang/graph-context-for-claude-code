/**
 * main.ts — Obsidian Plugin entry point. Lifecycle: loads settings, cleans stale locks, starts IdeServer, writes lock files, registers WorkspaceTracker, wires graph-context features. Cleans up on unload and process exit.
 */

import { Plugin, Notice, FileSystemAdapter, TFile, Modal, Setting } from 'obsidian';
import { randomUUID } from 'crypto';
import type { AuthToken, Port, VaultPort, EnrichedContext, SelectionState } from './protocol/types';
import { writeLockFiles, deleteLockFiles, cleanStaleLocks, buildLockFileData } from './protocol/lock-file';
import { startIdeServer } from './server/ide-server';
import type { IdeServer } from './server/ide-server';
import { makeRegistry } from './tools/registry';
import { makeSelectionToolEntries } from './tools/selection-tools';
import type { SelectionStateRef } from './tools/selection-tools';
import { makeWorkspaceToolEntries } from './tools/workspace-tools';
import type { WorkspaceContext, OpenEditor } from './tools/workspace-tools';
import { makeDiffToolEntry } from './tools/diff-tools';
import type { DiffContext } from './tools/diff-tools';
import { makeContextToolEntries } from './tools/context-tools';
import { extractSectionByHeading, extractBlock } from './context/section-extractor';
import { buildEnrichedContext } from './context/context-builder';
import { parseLinks } from './context/link-expander';
import { registerWorkspaceTracker } from './obsidian/workspace-tracker';
import { toAbsolutePath } from './obsidian/paths';
import { ClaudeCodeSettingTab, DEFAULT_SETTINGS } from './settings';
import type { ClaudeCodeSettings } from './settings';

export default class ClaudeCodePlugin extends Plugin {
  settings: ClaudeCodeSettings = DEFAULT_SETTINGS;
  private server: IdeServer | null = null;
  private currentPort: Port | null = null;
  private exitHandler: (() => void) | null = null;
  private noteCache: Map<string, string> = new Map<string, string>();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new ClaudeCodeSettingTab(this.app, this));

    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      new Notice('Graph Context for Claude Code: requires a desktop file-system vault');
      return;
    }

    const basePath = adapter.getBasePath();
    cleanStaleLocks(process.env);

    this.registerEvent(this.app.vault.on('modify', (f) => { if (f instanceof TFile) { void this.cacheNoteAndPrefetch(f); } }));
    this.registerEvent(this.app.workspace.on('file-open', (f) => { if (f instanceof TFile) { void this.cacheNoteAndPrefetch(f); } }));

    const stateRef: SelectionStateRef = { current: null, latest: null };

    const wsCtx: WorkspaceContext = {
      getWorkspaceFolders: () => [basePath],
      getOpenEditors: () => {
        const editors: OpenEditor[] = [];
        const activeFile = this.app.workspace.getActiveFile();
        this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
          const view = leaf.view as unknown as { file?: TFile };
          const f = view.file;
          if (f) {
            editors.push({
              filePath: toAbsolutePath(basePath, f.path),
              active: activeFile !== null && f.path === activeFile.path,
            });
          }
        });
        return editors;
      },
      openFile: async (filePath: string, _options) => {
        const rel = filePath.startsWith(basePath)
          ? filePath.slice(basePath.length).replace(/^[/\\]/, '')
          : filePath;
        const file = this.app.vault.getAbstractFileByPath(rel);
        if (file instanceof TFile) {
          await this.app.workspace.getLeaf(false).openFile(file);
          return true;
        }
        return false;
      },
      basePath,
    };

    const diffCtx: DiffContext = {
      basePath,
      showDiff: async (_oldPath, newPath, newContents, tabName) => {
        const rel = newPath.startsWith(basePath) ? newPath.slice(basePath.length).replace(/^[/\\]/, '') : newPath;
        const app = this.app;
        return await new Promise<'FILE_SAVED' | 'DIFF_REJECTED'>((resolve) => {
          let resolved = false;
          const modal = new Modal(app);
          modal.titleEl.setText(tabName || 'Claude Code: proposed change');
          const pre = modal.contentEl.createEl('pre');
          pre.setText(newContents);
          pre.style.maxHeight = '50vh';
          pre.style.overflow = 'auto';
          pre.style.whiteSpace = 'pre-wrap';
          const finish = (result: 'FILE_SAVED' | 'DIFF_REJECTED') => {
            if (resolved) return;
            resolved = true;
            resolve(result);
            modal.close();
          };
          new Setting(modal.contentEl)
            .addButton((b) => b.setButtonText('Accept').setCta().onClick(() => {
              void (async () => {
                try {
                  const existing = app.vault.getAbstractFileByPath(rel);
                  if (existing instanceof TFile) { await app.vault.modify(existing, newContents); }
                  else { await app.vault.create(rel, newContents); }
                } catch (_e) { /* best-effort */ }
                finish('FILE_SAVED');
              })();
            }))
            .addButton((b) => b.setButtonText('Reject').onClick(() => finish('DIFF_REJECTED')));
          const origOnClose = modal.onClose.bind(modal);
          modal.onClose = () => { origOnClose(); if (!resolved) { resolved = true; resolve('DIFF_REJECTED'); } };
          modal.open();
        });
      },
    };

    const toRel = (p: string): string => p.startsWith(basePath) ? p.slice(basePath.length).replace(/^[/\\]/, '') : p;
    const readNoteImpl = (notePath: string): string | null => this.noteCache.get(toRel(notePath)) ?? null;
    const vaultPort: VaultPort = {
      resolveLink: (linkText, fromPath) => {
        const dest = this.app.metadataCache.getFirstLinkpathDest(linkText, toRel(fromPath));
        return dest ? basePath + '/' + dest.path : null;
      },
      readNote: readNoteImpl,
      getSectionByHeading: (notePath: string, heading: string): string | null => { const t = readNoteImpl(notePath); return t === null ? null : extractSectionByHeading(t, heading); },
      getBlock: (notePath: string, blockId: string): string | null => { const t = readNoteImpl(notePath); return t === null ? null : extractBlock(t, blockId); },
      getFrontmatter: (notePath) => {
        const file = this.app.vault.getAbstractFileByPath(toRel(notePath));
        if (!(file instanceof TFile)) return null;
        const cache = this.app.metadataCache.getFileCache(file);
        return (cache?.frontmatter as Record<string, unknown> | undefined) ?? null;
      },
      getBacklinks: (notePath) => {
        const file = this.app.vault.getAbstractFileByPath(toRel(notePath));
        if (!(file instanceof TFile)) return [];
        const mc = this.app.metadataCache as unknown as { getBacklinksForFile?: (f: TFile) => { data: Map<string, unknown> } };
        const bl = mc.getBacklinksForFile?.(file);
        if (!bl || !bl.data) return [];
        const result: Array<{ path: string; name: string }> = [];
        bl.data.forEach((_v, p) => { const name = p.replace(/\.md$/, '').split('/').pop() ?? p; result.push({ path: basePath + '/' + p, name }); });
        return result;
      },
    };

    const buildContextFromState = (state: SelectionState): EnrichedContext => buildEnrichedContext({ noteText: vaultPort.readNote(state.filePath) ?? '', notePath: state.filePath, selectionStartLine: state.selection.start.line }, vaultPort);

    const registry = makeRegistry([
      ...makeSelectionToolEntries(stateRef),
      ...makeWorkspaceToolEntries(wsCtx),
      makeDiffToolEntry(diffCtx),
      ...makeContextToolEntries({
        stateRef,
        buildContext: (notePath, noteText, selectionStartLine) => buildEnrichedContext({ noteText, notePath, selectionStartLine }, vaultPort),
        readNote: vaultPort.readNote,
        basePath,
      }),
    ]);

    const authToken = randomUUID() as AuthToken;
    const ctx = {
      tools: registry.tools,
      handlers: registry.handlers,
      serverVersion: this.manifest.version,
    };

    const serverResult = await startIdeServer(authToken, ctx);
    if (!serverResult.ok) {
      new Notice('Graph Context for Claude Code: failed to start server: ' + serverResult.error);
      return;
    }

    this.server = serverResult.value;
    this.currentPort = serverResult.value.port;

    const lockResult = await writeLockFiles(
      this.currentPort,
      buildLockFileData(process.pid, [basePath], authToken),
      process.env
    );
    if (!lockResult.ok) {
      new Notice('Graph Context for Claude Code: failed to write lock file: ' + lockResult.error);
    }

    this.exitHandler = () => {
      if (this.currentPort !== null) {
        void deleteLockFiles(this.currentPort, process.env);
      }
    };
    process.on('exit', this.exitHandler);

    registerWorkspaceTracker({
      plugin: this,
      stateRef,
      onSelectionChanged: (state) => {
        this.server?.broadcast(state);
      },
      basePath,
      buildContext: buildContextFromState,
    });

    new Notice('Graph Context for Claude Code: ready on port ' + this.currentPort);
  }

  async onunload(): Promise<void> {
    if (this.exitHandler) {
      process.off('exit', this.exitHandler);
      this.exitHandler = null;
    }
    if (this.currentPort !== null) {
      await deleteLockFiles(this.currentPort, process.env);
    }
    if (this.server) {
      await this.server.close();
      this.server = null;
    }
    new Notice('Graph Context for Claude Code: disconnected');
  }

  /** Caches a note's text and prefetches (1-hop) the notes it links to/embeds, so context expansion works without opening each target. */
  private async cacheNoteAndPrefetch(file: TFile): Promise<void> {
    try {
      const text = await this.app.vault.cachedRead(file);
      this.noteCache.set(file.path, text);
      const links = parseLinks(text);
      const seen = new Set<string>();
      let prefetched = 0;
      const MAX_PREFETCH = 50;
      for (const link of links) {
        if (prefetched >= MAX_PREFETCH) break;
        const dest = this.app.metadataCache.getFirstLinkpathDest(link.linkText, file.path);
        if (!(dest instanceof TFile)) continue;
        if (dest.path === file.path) continue;
        if (seen.has(dest.path) || this.noteCache.has(dest.path)) continue;
        seen.add(dest.path);
        try {
          const t = await this.app.vault.cachedRead(dest);
          this.noteCache.set(dest.path, t);
          prefetched++;
        } catch (_e) { /* skip unreadable target */ }
      }
    } catch (_e) { /* ignore: best-effort cache */ }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
