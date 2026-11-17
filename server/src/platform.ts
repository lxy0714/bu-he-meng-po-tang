// 独立版平台契约层（开源导出解耦点 1/3）。
//
// 托管版里这一层由 Muse 平台的 @hatch/space-sdk 提供：defineAction
// 只是给动作定义打一个品牌标记并原样保存 request/response 的 zod
// schema 与 handler，真正的参数校验、响应校验与分发在平台 worker
// 里。本文件用同一契约在本地复刻：defineAction 的运行时行为与 SDK
// 的 createDefineAction 逐字一致（品牌字符串相同、字段相同），分发
// 与校验由 standalone.ts 的 HTTP 入口承担（请求 safeParse、响应
// parse、出错返回 { error }），动作语义不经此层改变。
//
// Ctx 只保留本游戏实际用到的成员：db（drizzle 访问器，standalone
// 实现见 standalone/ctx.ts）与 invalidateQueries（托管版用于通知
// 其他打开的客户端刷新；单机版无其他客户端，实现为空操作——动作
// 的返回值本身就是客户端的数据来源）。

import { z } from "zod";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

export { z };

/** 与 SDK 一致的动作品牌字符串（跨 bundle 以字符串识别动作定义）。 */
export const ACTION_BRAND = "@hatch/space-sdk/action/v1" as const;

/** 本游戏用到的 drizzle 数据库表面（与 SDK 的 SpaceDb 同口径）。 */
export type SpaceDb<TSchema extends Record<string, unknown> = Record<string, never>> = Pick<
  LibSQLDatabase<TSchema>,
  "select" | "insert" | "update" | "delete" | "run" | "all" | "get" | "batch"
>;

/** 每个动作 handler 收到的宿主上下文（独立版最小实现）。 */
export interface Ctx {
  readonly slug: string;
  readonly db: <TSchema extends Record<string, unknown> = Record<string, never>>() => SpaceDb<TSchema>;
  invalidateQueries(): void;
}

export interface ActionDefinition<Req extends z.ZodType = z.ZodType, Res extends z.ZodType = z.ZodType> {
  readonly __brand: typeof ACTION_BRAND;
  readonly request: Req;
  readonly response: Res;
  readonly description?: string;
  readonly handler: (ctx: Ctx, args: z.infer<Req>) => Promise<z.infer<Res>>;
}

export type ActionFactoryInput<Req extends z.ZodType, Res extends z.ZodType> = {
  request: Req;
  response: Res;
  /** One sentence telling the user's agent what the action does. */
  description?: string;
  handler: (ctx: Ctx, args: z.infer<Req>) => Promise<z.infer<Res>>;
};

/** 定义一个动作：与 SDK 一致，只打品牌并保存定义，不做别的处理。 */
export function defineAction<Req extends z.ZodType, Res extends z.ZodType>(
  spec: ActionFactoryInput<Req, Res>,
): ActionDefinition<Req, Res> {
  return {
    __brand: ACTION_BRAND,
    request: spec.request,
    response: spec.response,
    ...(spec.description !== undefined ? { description: spec.description } : {}),
    handler: spec.handler,
  };
}

/** 运行时识别动作定义（与 SDK 的 isAction 同口径）。 */
export function isAction(value: unknown): value is ActionDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "__brand" in value &&
    (value as { __brand?: unknown }).__brand === ACTION_BRAND &&
    "request" in value &&
    "response" in value &&
    "handler" in value &&
    typeof (value as { handler?: unknown }).handler === "function"
  );
}

/**
 * actions.ts 末尾 `satisfies ActionsModule` 的形状：每个导出都是带
 * handler 的动作定义（handler 参数放宽以绕开泛型不变性，与 SDK 的
 * ActionsModuleFor 同一处理）。
 */
export type ActionsModule = Record<
  string,
  Omit<ActionDefinition, "handler"> & { handler: (ctx: Ctx, args: never) => Promise<unknown> }
>;
