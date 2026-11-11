---
name: bun-runtime
description: 使用 Bun 驱动开发、工具和 CI 脚本，约定 pnpm 调度、API 使用与生产运行时边界。
---

# Bun 使用规则

- 开发、工具和 CI 脚本用 Bun 驱动；保留 pnpm --filter、pnpm -r 和脚本间的 pnpm 调用。
- 依赖由 pnpm 管理，bunfig.toml 默认设置 install.lockfile.save = false，只维护 pnpm 锁文件。Bun 版本沿用项目工具链，使用 mise 时固定在同一配置中，本地与 CI 一致。
- bun run <脚本名> 执行命名命令，bun run ./scripts/example.ts 直接执行文件；工具默认尊重 Node shebang，不统一加 --bun 强制切换运行时。
- 工具使用项目已安装并锁定的版本；bunx 加 --no-install，缺失依赖时报错，不临时下载。
- 保留测试框架和类型检查；bun run test 与 bun test 不能互换，执行 TS 文件不代替类型检查。
- 生产 Docker 构建和应用运行用 Node，生产构建链与安装钩子不依赖 Bun；共用脚本保持 Node 兼容，并在 Node 环境验证产物。
- 脚本可继续使用 node:* 和标准 Web API；Bun.*、bun:* 仅用于开发和 CI，不进入生产构建链或应用代码。

## 示例

工作区 package.json 保留 pnpm 调度和脚本间调用，开发与 CI 从 Bun 入口执行；包名与目录按项目调整：

```json
{
  "scripts": {
    "dev": "pnpm --filter @example/api dev",
    "report": "pnpm --filter @example/api report",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "build": "pnpm --filter @example/api build",
    "ci": "pnpm report && pnpm test && pnpm typecheck && pnpm build"
  }
}
```

应用 @example/api 的 package.json 片段如下。示例假设 src/main.ts 是 Node 兼容入口，构建输出 dist/main.js，Vitest 和 TypeScript 已通过 pnpm 安装：

```json
{
  "name": "@example/api",
  "scripts": {
    "dev": "bun --watch run ./src/main.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/main.js",
    "report": "bun run ./scripts/report.ts",
    "test": "bunx --no-install vitest run",
    "typecheck": "bunx --no-install tsc --noEmit"
  }
}
```

`scripts/report.ts` 是仅供开发和 CI 使用的报告脚本，可以使用 Bun 专有 API；生产代码不导入它：

```ts
await Bun.write("tool-report.json", JSON.stringify({ bun: Bun.version }));
```

本地从工作区根目录用 Bun 启动开发或工具命令，内部的 pnpm 调用保持原样：

```sh
bun run dev
bun run report
bun run test
bun run typecheck
```

CI 检出代码并准备项目指定版本的 Node、pnpm 和 Bun 后，用 pnpm 安装依赖，用 Bun 执行 CI 命令；测试和类型检查仍使用 Vitest、TypeScript：

```yaml
steps:
  - run: pnpm install --frozen-lockfile
  - run: bun run ci
```

生产 Docker 的关键片段如下，省略工具准备、依赖安装和文件复制；Node 版本与启动文件按项目实际产物调整：

```dockerfile
FROM node:24.22.2-slim AS builder
# 已准备 pnpm、源码和构建依赖
RUN pnpm --filter @example/api build

FROM node:24.22.2-slim AS runner
# 已复制运行产物和运行依赖
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
```

构建与启动都使用 Node，不安装 Bun，也不调用上面的 report 脚本。

默认在项目根目录的 bunfig.toml 中合并以下配置，关闭 Bun 锁文件保存：

```toml
[install.lockfile]
save = false
```
