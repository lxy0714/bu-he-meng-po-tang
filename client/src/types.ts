// 客户端共享类型：由服务端 Actions 的响应类型直接推导。

import { api, type ApiResponse } from "./api";

export type State = ApiResponse<typeof api, "getState">;
export type ErrorLogs = ApiResponse<typeof api, "getErrorLogs">;
export type ErrorLogEntry = ErrorLogs["logs"][number];
export type Character = NonNullable<State["character"]>;
export type BirthDraw = NonNullable<State["birthDraw"]>;
export type SettingKey = "q1" | "q2" | "q3" | "q4" | "q5" | "q6" | "q7" | "q8" | "q9" | "q10" | "q11" | "q12" | "q13" | "q14" | "q15" | "q16" | "q17" | "q18" | "q34";
export type ActKind = "cultivate" | "breakthrough" | "explore" | "rest" | "alchemy" | "forge" | "farm" | "fish";
export type SectKind = "join" | "chore" | "promote" | "stipend";
export type DrawField = "origin" | "destiny" | "root";
export type PointsAttr = "might" | "sense" | "fortune" | "body";
export type EconomyKind = "buyHeal" | "buyCult" | "buyBreak" | "useHeal" | "useCult" | "useBreak" | "sellPills" | "caveUpgrade";
export type SocialKind = "meet" | "visit" | "dual" | "guidance" | "teach" | "gift" | "duel" | "reconcile";
export type CommissionKind = "accept" | "claim" | "abandon";
export type QuestKind = "accept" | "branch" | "claim" | "abandon";
export type RoundGoalKind = "choose" | "abandon";
export type RandomExploreMode = "expedition" | "delve" | "tower";
export type TimedEventKind = "accept" | "claim" | "abandon";
export type TribulationStep = "face" | "fight" | "conclude";
