# Obsidian × Claude Code — IDE 連携プラグイン 設計書

> **この文書の目的**: このディレクトリで `claude` (Claude Code) を起動した別セッションが、本設計書だけを読んで Obsidian プラグインを実装できるようにする。実装者は本書を一次仕様とみなしてよい。プロトコル記述は実装済み OSS（`coder/claudecode.nvim` の PROTOCOL.md、`iansinnott/obsidian-claude-code-mcp`）から裏取り済み。

---

## 0. ゴールと非ゴール

### 達成したいこと（ユーザー要件）
- Obsidian で**今開いている（アクティブな）ファイル**を Claude Code が認識できる。
- Obsidian で**選択している行/テキスト**を Claude Code が取得できる。
- これを **Claude Code 公式の IDE 連携プロトコル**（VS Code / JetBrains / Zed 拡張と同じ仕組み）で実現する。CC 側は `/ide` で接続し、`getCurrentSelection` 等のツールとして利用する。

### アプローチの確定事項
- `celve/claude-code-zed`（Zed 版）と同じ「**lock ファイル + localhost WebSocket + MCP(JSON-RPC) IDE プロトコル**」を Obsidian に移植する。
- **Zed と違い外部ネイティブ binary は不要**。Obsidian プラグインは Electron(Node.js)上で動くため、**WebSocket サーバーをプラグイン内部に内蔵**できる（別プロセス管理は発生しない）。
- 既存 OSS `iansinnott/obsidian-claude-code-mcp` が同等のことを実装済み。**本実装はそれを参考にしてよいが、要件を「IDE連携（選択/アクティブファイルの反映）」に絞った最小構成**から作る。HTTP/SSE(Claude Desktop 用) や内蔵ターミナルは**非ゴール**。

### 非ゴール（最初のマイルストーンでは作らない）
- Claude Desktop 向け HTTP/SSE トランスポート
- 内蔵ターミナル(xterm.js)
- vault 全体への汎用 read/write MCP ツール（IDE 連携に不要な範囲）
- Windows 対応の作り込み（まず macOS。パス正規化だけ将来拡張可能に）

---

## 1. 全体アーキテクチャ

```
┌─────────────────────────── Obsidian (Electron / Node) ───────────────────────────┐
│  Plugin (TypeScript)                                                              │
│                                                                                   │
│  ┌─────────────────┐   active-leaf-change / editor selection 監視                 │
│  │ WorkspaceTracker │──────────────┐                                              │
│  └─────────────────┘              │ 現在の {filePath, selection} を保持            │
│                                   ▼                                               │
│  ┌─────────────────┐      ┌──────────────────┐     selection_changed 通知         │
│  │  LockFileManager │      │  IdeWebSocketServer (ws, 127.0.0.1:PORT)            │──┐
│  │  ~/.claude/ide/  │◀────▶│  - MCP JSON-RPC ハンドシェイク                       │  │
│  │  [PORT].lock 生成 │      │  - tools/list, tools/call ディスパッチ              │  │
│  └─────────────────┘      │  - notifications (selection_changed)                │  │
│                            └──────────────────┘                                  │  │
└───────────────────────────────────────────────────────────────────────────────┘  │
                                                                                     │
        ws://127.0.0.1:PORT  (header: x-claude-code-ide-authorization: <authToken>)  │
                                                                                     ▼
                                                    ┌──────────────────────────────────┐
                                                    │  Claude Code CLI (別ターミナル)    │
                                                    │  /ide → lock を発見 → 接続          │
                                                    │  mcp__ide__getCurrentSelection 等  │
                                                    └──────────────────────────────────┘
```

**役割分担（CC=MCPクライアント / プラグイン=MCPサーバー）**
- プラグインは MCP **サーバー**として振る舞い、ツールを公開する。
- CC は MCP **クライアント**として `initialize` → `tools/list` → `tools/call` を送る。
- 選択が変わるたびにプラグインは `selection_changed` 通知を push する（CC が能動的に poll しなくても最新選択を持てる）。

---

## 2. 接続プロトコル仕様（一次情報ベース・厳守）

### 2.1 Lock ファイル
- **パス解決順**（実装はこの順で書き込み先ディレクトリを決定する）:
  1. 環境変数 `CLAUDE_CONFIG_DIR` があれば `$CLAUDE_CONFIG_DIR/ide/`
  2. （Claude Code v1.0.30+）`~/.config/claude/ide/`
  3. レガシー fallback `~/.claude/ide/`
  - **堅牢策**: 解決した主ディレクトリと、存在すれば `~/.claude/ide/` の**両方に書く**と取りこぼしが少ない。少なくとも `~/.claude/ide/[PORT].lock` は必ず書く。
- **ファイル名**: `[PORT].lock`（PORT は実際に listen している TCP ポート番号）
- **中身（JSON）**:
  ```json
  {
    "pid": 12345,
    "workspaceFolders": ["/絶対パス/to/vault"],
    "ideName": "Obsidian",
    "transport": "ws",
    "authToken": "<UUID v4>"
  }
  ```
  - `pid`: `process.pid`
  - `workspaceFolders`: 現在の vault の絶対パス（`this.app.vault.adapter` の basePath）。配列。
  - `authToken`: 起動ごとに生成する UUID v4。WebSocket 接続時の認証に使う。
- **ライフサイクル**: サーバー listen 開始後に書き込み、プラグイン unload / Obsidian 終了時に**必ず削除**する。古い lock が残ると CC が死んだサーバーに繋ごうとするため、起動時に**自分の pid で生きていない lock を掃除**してもよい。

### 2.2 WebSocket
- **bind**: `127.0.0.1` のみ（外部公開禁止）。ポートは ephemeral（例: 10000–65535 でランダム、または固定既定 + 衝突時インクリメント）。
- **認証**: クライアント接続のハンドシェイク HTTP ヘッダ
  `x-claude-code-ide-authorization: <lock ファイルに書いた authToken>`
  を検証する。**一致しない接続は拒否**（close）。
- CC 側は lock ファイルの port / authToken を読んで接続する（環境変数 `CLAUDE_CODE_SSE_PORT` / `ENABLE_IDE_INTEGRATION=true` が使われることがある。サーバーは port を lock に書くだけでよい）。

### 2.3 メッセージ形式：MCP over JSON-RPC 2.0
すべて 1 WebSocket メッセージ = 1 JSON-RPC オブジェクト（テキストフレーム）。

**ハンドシェイク（CC→プラグイン の順序）**
1. `initialize` (request): プラグインは `result` で `protocolVersion`, `capabilities: { tools: {} }`, `serverInfo: { name: "obsidian-claude-code-ide", version }` を返す。
2. `notifications/initialized` (notification): 応答不要。
3. `tools/list` (request): 公開ツール一覧（name / description / inputSchema(JSON Schema)）を返す。
4. `tools/call` (request): `params: { name, arguments }`。下記ツールを実行し、MCP の結果形式で返す:
   ```json
   { "content": [ { "type": "text", "text": "<JSON文字列 or メッセージ>" } ], "isError": false }
   ```

**プラグイン→CC の通知（id なし notification）**
- `selection_changed`:
  ```json
  {
    "jsonrpc": "2.0",
    "method": "selection_changed",
    "params": {
      "text": "選択テキスト",
      "filePath": "/abs/path/note.md",
      "fileUrl": "file:///abs/path/note.md",
      "selection": {
        "start": { "line": 0, "character": 0 },
        "end":   { "line": 3, "character": 12 },
        "isEmpty": false
      }
    }
  }
  ```
  - `line`/`character` は **0-origin**。Obsidian の `editor.getCursor()` は 0-origin の `{line, ch}` なので `ch → character` に名前変換するだけ。
- `at_mentioned`（任意・"選択を明示送信" コマンド用）:
  ```json
  { "method": "at_mentioned", "params": { "filePath": "/abs/path", "lineStart": 10, "lineEnd": 20 } }
  ```

### 2.4 公開ツール（MVP で実装する優先順位）
| 優先 | ツール | 入力 | 出力(content.text) | 要件との対応 |
|---|---|---|---|---|
| ★必須 | `getCurrentSelection` | なし | 現在の選択 JSON（2.3 の selection 同形）。未選択ならカーソル位置/空 | **選択行の取得** |
| ★必須 | `getLatestSelection` | なし | 直近の非空選択 JSON | 選択を後から参照 |
| ★必須 | `getWorkspaceFolders` | なし | `{ folders: [{ path, name, uri }] }` | vault ルート提示 |
| ★必須 | `getOpenEditors` | なし | 開いているファイルの配列（`{ filePath, active }`） | **アクティブファイル** |
| ◎推奨 | `openFile` | `{ filePath, preview?, startText?, endText?, selectToEndOfLine?, makeFrontmost? }` | 開いた確認 | CC→Obsidian でファイルを開く |
| ◎推奨 | `openDiff` | `{ old_file_path, new_file_path, new_file_contents, tab_name }` | `"FILE_SAVED"` or `"DIFF_REJECTED"` | CC の提案差分を Obsidian で確認 |
| ○任意 | `getDiagnostics` | `{ uri? }` | 診断配列（md なので基本空でよい） | 互換のため空返し可 |
| ○任意 | `checkDocumentDirty`/`saveDocument`/`close_tab`/`closeAllDiffTabs` | 各仕様 | 文字列結果 | 後回し可 |

> **最小で動かす条件**: `initialize`/`tools/list`/`tools/call` ハンドシェイク + `getCurrentSelection` + `getOpenEditors` + `getWorkspaceFolders` + `selection_changed` 通知。これだけで「今のファイル/選択行が CC に渡る」要件は満たせる。`openDiff` は第2マイルストーン。

---

## 3. Obsidian API マッピング（実装の肝）

| 必要な情報/操作 | Obsidian API |
|---|---|
| アクティブファイル | `this.app.workspace.getActiveFile()` → `TFile`。絶対パスは `this.app.vault.adapter.getFullPath(file.path)`（型は `FileSystemAdapter`）または `(adapter as FileSystemAdapter).getBasePath()` + `file.path` |
| アクティブな editor | `this.app.workspace.activeEditor?.editor`（`Editor`）。CM6。 |
| 選択テキスト | `editor.getSelection()` |
| 選択範囲 | `editor.listSelections()` → `{ anchor:{line,ch}, head:{line,ch} }`。start/end は anchor/head を正規化（小さい方が start） |
| カーソル | `editor.getCursor("from")` / `getCursor("to")` |
| 変更購読 | `this.registerEvent(this.app.workspace.on("active-leaf-change", cb))` と CM6 の selection 変化。CM6 の `EditorView.updateListener` を拡張として登録、または `editor-change`/DOM `selectionchange` を `registerDomEvent` で購読（既存OSSは DOM `selectionchange` を採用） |
| vault ルート | `(this.app.vault.adapter as FileSystemAdapter).getBasePath()` |
| ファイルを開く | `this.app.workspace.openLinkText(...)` か `leaf.openFile(file)` |
| diff 表示 | Obsidian にネイティブ diff UI は無い。MVP では「新内容を一時 leaf に Markdown 表示 + 採用/却下ボタン」か、簡易に `new_file_contents` を一時ノートで開いてユーザー承認 → 元ファイルへ書き戻して `"FILE_SAVED"`。却下で `"DIFF_REJECTED"` |

**注意点**
- Obsidian の `line/ch` は 0-origin。プロトコルの `line/character` も 0-origin なので変換は `ch→character` のリネームのみ。
- パスは必ず**絶対パス**でプロトコルに載せる（CC はファイルシステム上の絶対パスを期待）。`fileUrl` は `file://` + encodeURI。
- イベント購読は必ず `registerEvent` / `registerDomEvent` 経由にして unload 時に自動解除（リーク防止）。

---

## 4. 推奨ファイル構成

```
obsidian-claude-code-ide/
├── DESIGN.md                  ← 本書
├── manifest.json              ← Obsidian プラグイン manifest（id, name, minAppVersion, isDesktopOnly:true）
├── package.json               ← ws, esbuild, typescript, jest/vitest 等
├── tsconfig.json
├── esbuild.config.mjs         ← Obsidian プラグインの標準ビルド
├── src/
│   ├── main.ts                ← Plugin 本体。onload/onunload。サーバー & トラッカー & lock の lifecycle
│   ├── settings.ts            ← ポート設定・接続状態表示（任意）
│   ├── protocol/
│   │   ├── types.ts           ← JSON-RPC / MCP / selection の型定義（branded 型 + Result 型）
│   │   ├── jsonrpc.ts         ← リクエスト/レスポンス/通知のシリアライズ・パース（純関数）
│   │   └── lock-file.ts       ← lock パス解決・生成・削除（純関数 + 薄い IO）
│   ├── server/
│   │   ├── ide-server.ts      ← ws サーバー起動/認証/接続管理
│   │   └── dispatch.ts        ← method ルーティング（initialize/tools.list/tools.call）純関数寄り
│   ├── tools/
│   │   ├── registry.ts        ← ツール登録（name/description/inputSchema/handler）
│   │   ├── selection-tools.ts ← getCurrentSelection / getLatestSelection
│   │   ├── workspace-tools.ts ← getWorkspaceFolders / getOpenEditors / openFile
│   │   └── diff-tools.ts      ← openDiff（第2マイルストーン）
│   └── obsidian/
│       ├── workspace-tracker.ts ← アクティブファイル/選択の追跡 + selection_changed 発火
│       └── paths.ts             ← 絶対パス/fileUrl 変換（純関数）
└── tests/
    ├── jsonrpc.test.ts
    ├── lock-file.test.ts
    ├── dispatch.test.ts
    └── selection.test.ts
```

---

## 5. 実装マイルストーン（TDD 前提）

> 実装者の global CLAUDE.md 準拠: **TDD 必須 / TypeScript 型安全 / 各ファイル冒頭に仕様コメント / Result 型でエラー処理 / branded 型 / any 禁止 / throw 禁止**。各ステップで対応するユニットテストを書き、`npm test` を緑にしてから次へ。

**M0: 足場**
- `manifest.json`(`isDesktopOnly: true`), `package.json`(deps: `ws`、dev: `typescript`/`esbuild`/`obsidian`/test runner), esbuild 設定, 空 Plugin が Obsidian にロードされる。

**M1: プロトコル基盤（純ロジック・テスト容易）**
- `protocol/types.ts`: `Selection`, `JsonRpcRequest/Response/Notification`, `ToolDefinition`, `Result<T,E>`。
- `protocol/jsonrpc.ts`: パース/組み立て純関数。**テスト先行**。
- `protocol/lock-file.ts`: パス解決順（2.1）・JSON 生成・削除。**テスト先行**（env による分岐を網羅）。

**M2: WebSocket サーバー + ハンドシェイク**
- `server/ide-server.ts`: 127.0.0.1 で listen、authToken ヘッダ検証、`initialize`/`notifications/initialized`/`tools/list` 応答。
- `server/dispatch.ts`: method ルーティング（純関数化してテスト）。
- 受け入れ: 別ターミナルの CC で `/ide` → "Obsidian" が出て接続できる（`tools/list` が返る）。

**M3: 選択 & アクティブファイル（要件の核心）**
- `obsidian/workspace-tracker.ts`: active-leaf-change / selection 変化を購読し、現在状態を保持。変化時に `selection_changed` を全接続へ push。
- `tools/selection-tools.ts` + `tools/workspace-tools.ts`: `getCurrentSelection`/`getLatestSelection`/`getOpenEditors`/`getWorkspaceFolders`。
- 受け入れ（下記 6 章）: CC から選択行が取れる。

**M4: 書き戻し系（任意）**
- `openFile`, `openDiff`（簡易 diff UI）。

---

## 6. 受け入れ基準 / 動作確認手順

実装が「要件を満たした」と言える条件:

1. Obsidian でこのプラグインを有効化すると `~/.claude/ide/[PORT].lock` が生成される（`cat` して `ideName:"Obsidian"`, `workspaceFolders` に vault 絶対パス, `authToken` があること）。
2. **別ターミナル**で対象 vault とは無関係のディレクトリでも可、`claude` を起動 → `/ide` → 一覧に **Obsidian** が出て選択すると接続成功。
3. Obsidian でノートの数行を選択した状態で、CC に「今 Obsidian で選択している行は？」と聞く →  CC が `getCurrentSelection`（`mcp__ide__getCurrentSelection`）で**選択テキストと行範囲**を取得して答える。
4. Obsidian で別ノートにフォーカスを移すと、CC が `getOpenEditors`/`getCurrentSelection` で**アクティブファイルの切替**を認識する。
5. プラグインを無効化 / Obsidian を終了すると lock ファイルが消える。

> 手動 E2E に加え、M1/M2 のプロトコル純ロジックはユニットテストで網羅。WebSocket は `ws` のクライアントでループバック接続するインテグレーションテストを 1 本用意。

---

## 7. セキュリティ / 堅牢性

- WebSocket は **127.0.0.1 のみ**。authToken ヘッダ不一致は即 close。token は UUID v4、起動ごとに再生成。
- lock ファイルは port を晒すので token 検証が生命線。lock の削除漏れに注意（unload・`process.on("exit")` 双方でクリーンアップ）。
- ポート衝突時は別ポートで再試行し、lock の古いエントリを掃除。
- `openDiff`/`openFile` は vault 内パスに限定するか、絶対パスを正規化して**vault 外への書き込みをガード**（CC が任意パスを渡しても安全側に倒す）。
- すべての IO 失敗は **Result 型**で表現し、サーバーループを落とさない（1 接続の失敗が全体を止めない）。

---

## 8. 参考実装（読んでよい一次情報）

- `iansinnott/obsidian-claude-code-mcp` — 本要件のほぼ上位互換。`src/mcp/server.ts`(ws), `src/ide/ide-tools.ts`, `src/obsidian/workspace-manager.ts` が直接の参考。**HTTP/SSE・terminal 部分は無視**してよい。
- `coder/claudecode.nvim` の `PROTOCOL.md` — lock/ws/JSON-RPC/ツールスキーマの一次仕様（本書 2 章の出典）。
- `celve/claude-code-zed` — 同プロトコルの Zed 実装。Zed は外部 binary が要るが Obsidian は不要、という差分の確認用。

> 設計判断: 既存 `obsidian-claude-code-mcp` をそのまま使う選択肢もあるが、本プロジェクトは「IDE連携に絞った最小・自己管理可能な実装を持つ」ことが目的なので**スクラッチ実装**する。ただし詰まったら上記 src を参照する。

---

## 9. 未決事項（実装者が判断 or ユーザーに確認）

- ポートを固定既定値にするか完全ランダムにするか（衝突処理込み）。
- `openDiff` の UI をどこまで作るか（MVP は「一時ノート表示 + 承認で書き戻し」で十分）。
- 選択追跡を CM6 updateListener にするか DOM `selectionchange` にするか（既存OSSは後者で安定）。
