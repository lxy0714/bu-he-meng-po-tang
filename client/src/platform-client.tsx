// 独立版客户端平台层（开源导出解耦）：托管版由 @hatch/space-sdk/client
// 提供的两个组件级依赖在此本地复刻，行为口径与 SDK 版一致。
//
// - spaceQueryClient：全应用共享的 TanStack QueryClient。默认值照
//   SDK 的保守口径（staleTime 30s、关闭窗口聚焦重拉、查询重试只认
//   明确可重试的失败）；App 自己的 game-state 查询另有桥接重试
//   策略覆盖，与此处不冲突。
// - SafeAreaTopScrim：顶部安全区保护条——固定定位、指针穿透，高度
//   为安全区内边距（渐变档再加一段淡出）。独立版没有宿主壳层，
//   --twsa-safe-area-inset-top 由 tailwindcss-safe-area 提供，未定义
//   时 calc 自然退化，桌面端高度近乎为零。

import { QueryClient } from "@tanstack/react-query";
import { createElement, type CSSProperties } from "react";

export const spaceQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const TOP_SAFE_AREA_SCRIM_HEIGHT = "calc(var(--twsa-safe-area-inset-top, 0px) + min(2rem, var(--twsa-safe-area-inset-top, 0px)))";
const TOP_SAFE_AREA_INSET_HEIGHT = "var(--twsa-safe-area-inset-top, 0px)";
const TOP_SAFE_AREA_GRADIENT_MASK = "linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.99) 10%, rgba(0, 0, 0, 0.96) 20%, rgba(0, 0, 0, 0.90) 30%, rgba(0, 0, 0, 0.80) 40%, rgba(0, 0, 0, 0.67) 50%, rgba(0, 0, 0, 0.52) 60%, rgba(0, 0, 0, 0.36) 70%, rgba(0, 0, 0, 0.20) 80%, rgba(0, 0, 0, 0.08) 90%, rgba(0, 0, 0, 0) 100%)";

export interface SafeAreaTopScrimProps {
  variant?: "gradient" | "solid" | "blur";
  backgroundColor?: string;
  zIndex?: number;
  className?: string;
  style?: CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
}

export function SafeAreaTopScrim({ variant = "gradient", backgroundColor, zIndex = 40, className, style, ...props }: SafeAreaTopScrimProps) {
  const resolvedBackgroundColor = backgroundColor ?? style?.backgroundColor ?? "var(--bg)";
  const managedStyle: CSSProperties = {
    ...style,
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex,
    pointerEvents: "none",
    height: variant === "gradient" ? TOP_SAFE_AREA_SCRIM_HEIGHT : TOP_SAFE_AREA_INSET_HEIGHT,
    backgroundColor: resolvedBackgroundColor,
  };
  if (variant === "gradient") {
    managedStyle.maskImage = TOP_SAFE_AREA_GRADIENT_MASK;
    managedStyle.WebkitMaskImage = TOP_SAFE_AREA_GRADIENT_MASK;
  } else if (variant === "blur") {
    managedStyle.backdropFilter = style?.backdropFilter ?? "blur(12px)";
    managedStyle.WebkitBackdropFilter = style?.WebkitBackdropFilter ?? "blur(12px)";
  }
  return createElement("div", {
    ...props,
    "aria-hidden": props["aria-hidden"] ?? true,
    className,
    style: managedStyle,
  });
}
