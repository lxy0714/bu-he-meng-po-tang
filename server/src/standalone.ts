// 独立版入口（开源导出解耦点 3/3）：Bun.serve 单进程托管。
//
// - POST /api/<action>：把请求 JSON 的 args 交给 actions.ts 的动作
//   表分发——先用动作的 request schema 校验参数（safeParse），再调
//   handler，最后用 response schema 校验返回值；成功返回
//   { data }，失败返回 { error } + 对应状态码，与托管版客户端
//   createActionClient 的收发口径一致（本仓库的客户端 api.ts 按
//   同一口径对接）。
// - 其余路径：托管 client/dist/ 的构建产物（SPA 单页，找不到文件
//   时回 index.html）；/api/ 下未知动作返回 404 JSON。
// - 存档走 ctx.db（standalone/db.ts 的 bun:sqlite 实现），经既有
//   SaveStorage 抽象读写，导出/导入存档 JSON 与托管版兼容。
//
// 环境变量：PORT（默认 4173）、GAME_DB_PATH（默认 ./data/game.db）。

import { existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { Actions } from "./actions";
import { isAction, type ActionDefinition, type Ctx } from "./platform";
import { createStandaloneDb } from "./standalone/db";
import { createStandaloneCtx } from "./standalone/ctx";

const PORT = Number(process.env.PORT ?? 4173);
const DB_PATH = process.env.GAME_DB_PATH ?? "./data/game.db";
const CLIENT_DIST = join(import.meta.dir, "../../client/dist");

const db = createStandaloneDb(DB_PATH);
const ctx: Ctx = createStandaloneCtx(db);

const actionTable = new Map<string, ActionDefinition>();
for (const [name, def] of Object.entries(Actions)) {
  if (isAction(def)) actionTable.set(name, def);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function handleAction(name: string, req: Request): Promise<Response> {
  const def = actionTable.get(name);
  if (!def) return json({ error: `unknown action: ${name}` }, 404);
  let args: unknown = {};
  try {
    const body = (await req.json()) as { args?: unknown } | null;
    args = body && typeof body === "object" && "args" in body ? body.args ?? {} : {};
  } catch {
    return json({ error: `action ${name}: request body is not valid JSON` }, 400);
  }
  const parsed = def.request.safeParse(args);
  if (!parsed.success) {
    return json({ error: `invalid args for action ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}` }, 400);
  }
  try {
    const result = await def.handler(ctx, parsed.data);
    const checked = def.response.safeParse(result);
    if (!checked.success) {
      console.error(`[standalone] action ${name}: response validation failed`, checked.error.issues);
      return json({ error: `response validation failed for action ${name}` }, 500);
    }
    return json({ data: checked.data });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[standalone] action ${name} failed:`, e);
    return json({ error: message }, 500);
  }
}

function serveStatic(pathname: string): Response {
  const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(CLIENT_DIST, rel === "/" || rel === "." ? "index.html" : rel);
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return new Response(Bun.file(filePath), {
      headers: { "content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream" },
    });
  }
  // SPA 回退：非 API、非静态文件的路径回首页。
  const indexPath = join(CLIENT_DIST, "index.html");
  if (existsSync(indexPath)) {
    return new Response(Bun.file(indexPath), { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return new Response("client not built yet — run `bun run build` first", { status: 503 });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      if (req.method !== "POST") return json({ error: "actions require POST" }, 405);
      return handleAction(decodeURIComponent(url.pathname.slice("/api/".length)), req);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });
    return serveStatic(url.pathname);
  },
});

console.log(`不喝孟婆汤（独立版）已启动：http://localhost:${server.port}（存档：${DB_PATH}，动作 ${actionTable.size} 个）`);
