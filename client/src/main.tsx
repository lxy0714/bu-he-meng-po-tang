import { spaceQueryClient } from "./platform-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./theme.css";

const rootEl = document.querySelector<HTMLElement>("[data-app-root]");
if (!rootEl) {
  throw new Error("missing generated space root element");
}

// 独立版入口：QueryClient 来自本地 platform-client（与托管版共享
// 同一份保守默认值）；外层 div 只是 React 挂载点，无宿主壳层样式依赖。
createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={spaceQueryClient}>
      <div>
        <App />
      </div>
    </QueryClientProvider>
  </StrictMode>,
);
