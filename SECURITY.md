# 安全说明 · Security

- 本游戏不收集任何用户数据：存档只保存在运行机器本地的 SQLite 文件（`./data/game.db`）中，不向任何服务器上报游戏数据。
  This game collects no user data: saves are stored only in a local SQLite file (`./data/game.db`) on the machine running it, and no game data is sent anywhere.
- AI 陪跑的 API Key 只保存在玩家浏览器的 localStorage 中；服务端仅在每次请求时把 Key 透传给玩家所选的厂商，不落盘、不记日志。请勿公开分享带有自己 Key 的浏览器配置文件。
  AI companion API keys are stored only in the player's browser localStorage. The server forwards a key to the player-selected provider per request and never persists or logs it. Do not publicly share browser profiles that contain your key.
- 本地模型（Ollama / LM Studio）由浏览器直连玩家本机地址，Key 不经手服务端。
  Local models (Ollama / LM Studio) are called directly from the browser to the player's own machine; no key passes through the server.
- 发现安全问题请通过 GitHub Issues 报告；涉及敏感细节时，请先通过仓库所有者的 GitHub 主页联系再披露。
  Please report security issues via GitHub Issues; for sensitive details, contact the repository owner through their GitHub profile before disclosing.
