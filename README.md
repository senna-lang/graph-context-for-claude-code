# Graph Context for Claude Code

**Claude Code IDE integration for Obsidian — with your knowledge graph attached.**

This plugin makes Obsidian show up in Claude Code's `/ide` picker (the same lock-file +
localhost WebSocket + MCP protocol that the VS Code and JetBrains extensions use), so Claude
Code automatically sees the note you're editing and the text you've selected.

On top of that base IDE integration, it adds the thing that makes Obsidian different from a
code editor: **expanded graph context**. When you select text, the plugin doesn't just send the
raw markdown with opaque `[[links]]` — it resolves and inlines the surrounding knowledge graph
and ships it in a single payload:

- `![[embeds]]` → the linked note's **actual content**, inlined
- `[[wikilinks]]` → a short **summary** (frontmatter + first paragraph) of each target
- the **heading path** of your cursor (e.g. `## Section > ### Subsection`)
- the note's **frontmatter**
- the note's **backlinks**

No extra MCP server, no multi-step tool calls — it arrives with the selection.

---

## Why this is different

Every other Obsidian ↔ Claude Code integration (and every generic Obsidian MCP server) reaches
linked content the same way: **Claude pulls it, link by link, in multiple round-trips.** Claude
sees `[[Some Note]]` as opaque text, has to decide to resolve it, calls a resolve/read tool, gets
raw markdown back (with *more* `[[links]]` inside), and repeats — N links means N×2 tool calls.
Servers that run *outside* Obsidian even re-implement Obsidian's link resolution themselves, which
can diverge from how Obsidian actually resolves links.

This plugin instead does the resolution **server-side, inside Obsidian**, using Obsidian's own
`metadataCache` link resolver, expands the content once, and **pushes** it with the selection.

|                         | Typical plugins / MCP servers      | Graph Context for Claude Code |
| ----------------------- | ---------------------------------- | ----------------------------- |
| Link content delivery   | Claude pulls, N round-trips        | Pushed once with the selection |
| `[[link]]` content      | Raw / not expanded                 | Embeds inlined, links summarized |
| Link resolution         | Claude-driven or re-implemented    | Obsidian's own resolver |
| Heading path / backlinks| Separate tool calls (if any)       | Included in the payload |

> It is not that other tools *can't* get this context — it's that they make Claude fetch it,
> link by link, after the fact. Here it's automatic, resolved correctly, and zero round-trips.

---

## Requirements

- Desktop Obsidian (the plugin is `isDesktopOnly` — it runs a Node WebSocket server).
- [Claude Code](https://docs.claude.com/en/docs/claude-code) installed in a terminal.

## Installation

### Manual

1. Build (or download a release): `npm install && npm run build`
2. Copy `main.js` and `manifest.json` into your vault at
   `<vault>/.obsidian/plugins/graph-context-for-claude-code/`
3. In Obsidian: **Settings → Community plugins**, turn off Restricted Mode if needed, then enable
   **Graph Context for Claude Code**.

You should see a notice: `Graph Context for Claude Code: ready on port <PORT>`.

## Usage

1. Enable the plugin in your vault.
2. In a separate terminal, run `claude`, then type `/ide` and pick **Obsidian**.
3. Ask Claude about what you're looking at — it can read your active file and selection, with the
   surrounding graph context attached.

Select a few lines in a note that contains links/embeds, then ask e.g. *"summarize what I've
selected and how it connects to the linked notes"* — Claude already has the expanded context.

### Tools exposed (MCP)

Base IDE tools: `getCurrentSelection`, `getLatestSelection`, `getWorkspaceFolders`,
`getOpenEditors`, `openFile`, `openDiff`.

Graph-context tools:

- **`getSelectionWithContext`** — current selection + `EnrichedContext` (heading path, frontmatter,
  expanded embeds, wikilink summaries, backlinks).
- **`getNoteExpanded`** `{ path }` — any vault note, expanded the same way (path-guarded to the vault).

The standard `selection_changed` notification is also enriched with a `context` field, so the
context follows your selection automatically.

## Settings

- **Fixed port** — leave empty/`0` for a random ephemeral port (recommended), or set a fixed port.

## How it works

- On load, the plugin starts a WebSocket server bound to `127.0.0.1`, writes a lock file to
  `~/.config/claude/ide/<port>.lock` (and `~/.claude/ide/<port>.lock`) containing the port, the
  vault path, and a per-session auth token, and cleans it up on unload/exit.
- Claude Code discovers the lock file, connects, authenticates with the token, and speaks
  MCP over JSON-RPC 2.0.
- Selection tracking uses CodeMirror 6's update listener (reliable, unlike DOM `selectionchange`).
- The graph-context layer (`src/context/`) is pure and Obsidian-free: it takes an injected
  `VaultPort` (backed by `metadataCache` / `vault.cachedRead`) so the link-expansion, summary,
  heading-path and size-capping logic is fully unit-tested.

## Notes & limits

- `![[note#heading]]` embeds expand to just that section; `![[note#^block]]` to just that block.
- Expansion is **depth-1** (a linked note's own links are not expanded further).
- Expanded context is size-capped (embeds 2000 chars, wikilink summaries 200, total 8000, backlinks
  20) with explicit `truncated` flags — never silently dropped.
- Link targets are read from an in-memory cache populated on file-open/modify, plus a 1-hop
  prefetch of the opened note's link/embed targets — so embeds expand without opening each target
  first. A target that has neither been opened nor referenced by an opened note this session may
  not be cached yet.
- `selection_changed` is debounced (~150 ms) so a drag-select doesn't flood the connection. Graph
  context is attached only to non-empty selections; a bare cursor move sends just the standard
  selection fields. Note-level context (frontmatter, links, backlinks) is memoized per note, so
  moving the cursor within a note only recomputes the heading path.
- The pull tools (`getSelectionWithContext`, `getNoteExpanded`) always return full context on demand,
  regardless of the above push-side optimizations.

## Security

The WebSocket server binds to `127.0.0.1` only and rejects any connection whose
`x-claude-code-ide-authorization` header doesn't match the per-session token in the lock file.
File-opening / diff tools are guarded to the vault root.

## Disclaimer

This is an independent, unofficial integration. "Claude Code" is a product of Anthropic; this
plugin is not affiliated with or endorsed by Anthropic.

## License

[MIT](LICENSE) © 2026 senna-lang
