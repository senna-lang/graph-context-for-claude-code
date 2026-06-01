import { build } from "esbuild";

const isDev = process.argv.includes("--dev");

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  outfile: "main.js",
  // NOTE: `ws` は npm パッケージなのでバンドルに含める（プラグインフォルダに node_modules が無く、external にすると実行時 require('ws') が失敗する）。
  // obsidian/electron/@codemirror/@lezer は Obsidian 提供、path/fs/os/net/crypto は Electron 組込みなので external のまま。
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", "path", "fs", "os", "net", "crypto"],
  minify: !isDev,
  sourcemap: isDev ? "inline" : false,
  logLevel: "info"
});
