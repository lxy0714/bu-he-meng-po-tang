// 独立版客户端打包：Bun.build + bun-plugin-tailwind，与托管版的构建
// 配置同口径（入口 client/index.html、产物 client/dist、生产模式
// NODE_ENV、assets/[name]-[hash] 命名），只去掉平台专属的版本号
// 注入与守卫。打包后修正一处 Bun 的已知行为：导入资源的 URL 被写
// 成裸文件名，需补上 assets/ 前缀才与产物目录一致（托管版 SDK 的
// buildClient 做同样的修正）。

import { rm } from "node:fs/promises";
import { basename } from "node:path";
import tailwindPlugin from "bun-plugin-tailwind";

const ENTRY = "./client/index.html";
const OUTDIR = "./client/dist";

await rm(OUTDIR, { force: true, recursive: true });

const result = await Bun.build({
  entrypoints: [ENTRY],
  outdir: OUTDIR,
  minify: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  naming: {
    asset: "assets/[name]-[hash].[ext]",
    chunk: "assets/[name]-[hash].[ext]",
    entry: "[name].[ext]",
  },
  plugins: [tailwindPlugin],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new Error("client build failed; see logged diagnostics");
}

const assetFiles = result.outputs
  .filter((output) => output.kind === "asset")
  .map((output) => basename(output.path));

for (const output of result.outputs) {
  if (!/\.(js|css|html)$/.test(output.path)) continue;
  let text = await output.text();
  let changed = false;
  for (const name of assetFiles) {
    const bare = `./${name}`;
    if (text.includes(bare)) {
      text = text.split(bare).join(`./assets/${name}`);
      changed = true;
    }
  }
  if (changed) await Bun.write(output.path, text);
}

console.log(`client built → ${OUTDIR} (${result.outputs.length} outputs)`);
