// Typed RPC client（独立版）：类型来自 server/src/actions.ts，运行时
// 走普通 fetch —— POST /api/<action>，请求体 { args }，成功响应
// { data }、失败响应 { error }（由 server/src/standalone.ts 对接）。
// 各组件调用的函数签名与托管版（SDK createActionClient）完全一致，
// 组件层零改动。
//
// `import type { Actions }` 是纯类型导入：客户端 bundle 不会把服务端
// 运行时代码（bun:sqlite 等）拉进来。verbatimModuleSyntax 下去掉
// `type` 会直接编译报错。

import type { Actions } from "../../server/src/actions";
import type { z } from "zod";

type ActionShape = { request: z.ZodType; response: z.ZodType };
type ActionClient<A extends Record<string, ActionShape>> = {
  [K in keyof A]: (args: z.input<A[K]["request"]>) => Promise<z.infer<A[K]["response"]>>;
};

function createActionClient<A extends Record<string, ActionShape>>(): ActionClient<A> {
  return new Proxy({}, {
    get(_target, name) {
      // Symbol 键与 promise 协议名（then/catch/finally）不能解析成
      // 假动作，否则 await 客户端会误发请求（与 SDK 版同一防护）。
      if (typeof name !== "string") return undefined;
      if (name === "then" || name === "catch" || name === "finally") return undefined;
      return async (args: unknown) => {
        const response = await fetch(`/api/${name}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ args: args ?? {} }),
        });
        const body = (await response.json().catch(() => null)) as { data?: unknown; error?: unknown } | null;
        if (!response.ok || (body && typeof body === "object" && "error" in body && body.error)) {
          const message = body && typeof body.error === "string" ? body.error : `action ${name} failed: ${response.status}`;
          throw new Error(message);
        }
        return body?.data;
      };
    },
  }) as ActionClient<A>;
}

export const api = createActionClient<typeof Actions>();

// Re-exported for convenience so client code can do
//
//     import { api, type ApiResponse } from "./api";
//     type State = ApiResponse<typeof api, "getState">;
export type ApiRequest<C extends Record<string, (args: never) => Promise<unknown>>, K extends keyof C> = Parameters<C[K]>[0];
export type ApiResponse<C extends Record<string, (args: never) => Promise<unknown>>, K extends keyof C> = Awaited<ReturnType<C[K]>>;
