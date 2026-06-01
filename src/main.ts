/**
 * main.ts — Obsidian Plugin entry point. Lifecycle: loads settings, cleans stale locks, starts IdeServer, writes lock files, registers WorkspaceTracker. Cleans up on unload and process exit.
 */

import { Plugin, Notice, FileSystemAdapter, TFile, Modal } from 'obsidian';
import { randomUUID } from 'crypto';
import type { AuthToken, Port } from './protocol/types';
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
import { registerWorkspaceTracker } from './obsidian/workspace-tracker';
import { toAbsolutePath } from './obsidian/paths';
import { ClaudeCodeSettingTab, DEFAULT_SETTINGS } from './settings';
import type { ClaudeCodeSettings } from './settings';

export default class ClaudeCodePlugin extends Plugin {
  settings: ClaudeCodeSettings = DEFAULT_SETTINGS;
  private server: IdeServer | null = null;
  private currentPort: Port | null = null;
  private exitHandler: (() => void) | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new ClaudeCodeSettingTab(this.app, this));

    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      new Notice('Claude Code IDE: requires a desktop file-system vault');
      return;
    }

    const basePath = adapter.getBasePath();
    cleanStaleLocks(process.env);

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
          const buttons = modal.contentEl.createDiv();
          const acceptBtn = buttons.createEl('button', { text: 'Accept' });
          const rejectBtn = buttons.createEl('button', { text: 'Reject' });
          const finish = (result: 'FILE_SAVED' | 'DIFF_REJECTED') => {
            if (resolved) return;
            resolved = true;
            resolve(result);
            modal.close();
          };
          acceptBtn.addEventListener('click', () => {
            void (async () => {
              try {
                const existing = app.vault.getAbstractFileByPath(rel);
                if (existing instanceof TFile) { await app.vault.modify(existing, newContents); }
                else { await app.vault.create(rel, newContents); }
              } catch (_e) {
                // best-effort: still report saved per M4 simple-UI contract
              }
              finish('FILE_SAVED');
            })();
          });
          rejectBtn.addEventListener('click', () => finish('DIFF_REJECTED'));
          const origOnClose = modal.onClose.bind(modal);
          modal.onClose = () => { origOnClose(); if (!resolved) { resolved = true; resolve('DIFF_REJECTED'); } };
          modal.open();
        });
      },
    };

    const registry = makeRegistry([
      ...makeSelectionToolEntries(stateRef),
      ...makeWorkspaceToolEntries(wsCtx),
      makeDiffToolEntry(diffCtx),
    ]);

    const authToken = randomUUID() as AuthToken;
    const ctx = {
      tools: registry.tools,
      handlers: registry.handlers,
      serverVersion: this.manifest.version,
    };

    const serverResult = await startIdeServer(authToken, ctx);
    if (!serverResult.ok) {
      new Notice('Claude Code IDE: failed to start server: ' + serverResult.error);
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
      new Notice('Claude Code IDE: failed to write lock file: ' + lockResult.error);
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
    });

    new Notice('Claude Code IDE ready on port ' + this.currentPort);
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
    new Notice('Claude Code IDE disconnected');
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
