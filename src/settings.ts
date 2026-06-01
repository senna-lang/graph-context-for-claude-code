/**
 * settings.ts — Plugin settings type, defaults, and PluginSettingTab for port override.
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import type ClaudeCodePlugin from './main';

export type ClaudeCodeSettings = {
  fixedPort: number | null;
  showStatusBar: boolean;
};

export const DEFAULT_SETTINGS: ClaudeCodeSettings = {
  fixedPort: null,
  showStatusBar: true,
};

export class ClaudeCodeSettingTab extends PluginSettingTab {
  private plugin: ClaudeCodePlugin;

  constructor(app: App, plugin: ClaudeCodePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName('Fixed port')
      .setDesc('Port for the IDE WebSocket server. Leave 0 or empty for a random port.')
      .addText(text => text
        .setPlaceholder('0')
        .setValue(this.plugin.settings.fixedPort?.toString() ?? '')
        .onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.fixedPort = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
          await this.plugin.saveSettings();
        }));
  }
}
