---
name: test-infrastructure
description: 组织测试文件、依赖、Vitest 配置和根 E2E 工作区。
---

# 测试工程规则

- 单模块测试与源码同名同级，目录入口对应 `index.test.ts(x)`。同一模块拆多个场景时仍放同级，用场景名区分。跨模块或依赖真实基础设施的集成测试放就近的 `__tests__`。
- 初始化、夹具、mock 和工具按使用范围放置。多个应用共享的放根测试目录，单包共用的留在包内，只服务一组测试的就近放置。
- 主要应用优先继承根测试配置。Node、DOM 等环境通过 `projects` 区分，各 project 声明扫描范围，按需继承或覆盖初始化。包需要独立运行时保留包内配置，并从根扫描中排除。
- 测试文件级初始化通过 `setupFiles` 接入，项目级资源由 `globalSetup` 或执行入口准备。多个 project 复用同一资源时，显式处理重复初始化。用例间需要隔离的状态由测试钩子重置。
- 根配置和根测试设施直接使用的依赖由根包声明，包内测试设施使用的专用依赖由所属包声明。根配置引用包内初始化时，专用依赖仍归该包。Vitest 与覆盖率插件保持版本兼容，版本集中方式沿用工作区约定。
- 数据库测试按所需能力选择环境。轻量数据库可复用迁移快照，依赖生产数据库扩展或行为的测试使用独立测试库。并行执行时隔离数据和连接，共用测试库时限制并发。
- Web E2E 放在根 `e2e/` 私有工作区包，包内维护依赖、配置和执行入口。主应用测试配置排除整个 E2E 包，包内辅助代码的单测也由该包执行。CLI 等独立宿主按所需工具链和运行环境选择归属。

## 示例

下面的文件结构展示源码旁测试、共享设施和独立执行入口。应用目录按项目实际布局选择：

```text
项目根目录/
├── package.json
├── pnpm-workspace.yaml
├── vitest.config.mts
├── tests/
│   ├── setup.ts
│   ├── utils.tsx
│   └── mocks/
├── src/services/item/
│   ├── index.ts
│   └── index.test.ts
├── apps/service/src/
│   └── __tests__/integration/
├── packages/database/
│   ├── vitest.config.mts
│   ├── vitest.config.server.mts
│   ├── src/
│   │   ├── core/getTestDB.ts
│   │   └── models/__tests__/
│   └── tests/
│       ├── setup-db.ts
│       └── pgliteSnapshot.globalSetup.ts
└── e2e/
    ├── package.json
    ├── cucumber.config.js
    ├── vitest.config.mts
    └── src/
        ├── features/
        ├── steps/
        ├── support/
        └── mocks/
```

依赖按使用位置声明。下表以 React、PGlite 和 Cucumber + Playwright 为例：

| 归属 | 依赖 |
| --- | --- |
| 根测试设施 | `vitest`、`@vitest/coverage-v8`、`happy-dom`、`@testing-library/react`、`@testing-library/user-event`、`@testing-library/jest-dom`、`fake-indexeddb` |
| 数据库包 | `@electric-sql/pglite`、`dotenv`、`fake-indexeddb` 为开发依赖，`pg`、`drizzle-orm` 由包声明为 peer 依赖 |
| E2E 包 | `@cucumber/cucumber`、`playwright`、`@playwright/test`、`pg`、`bcryptjs`，开发依赖包含 `tsx` 和 `cross-env` |

根 `vitest.config.mts` 的两个 project 继承共享初始化，分别扫描主应用和服务端测试：

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: "./tests/setup.ts",
    projects: [
      {
        extends: true,
        test: {
          name: "app",
          environment: "happy-dom",
          include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["apps/service/src/**/*.test.ts"],
        },
      },
    ],
  },
});
```

采用 PGlite 的数据库包可通过 `globalSetup` 生成迁移后的快照，测试通过 `getTestDB()` 恢复。需要 PostgreSQL 扩展时，独立配置读取 `DATABASE_TEST_URL`，共享同一个测试库时可串行执行。

使用 Cucumber 时，将 `e2e` 登记为工作区成员。根脚本可用 `pnpm --filter @example/e2e test` 转发，包内命令可以先验证辅助代码，再执行浏览器场景：

```json
{
  "name": "@example/e2e",
  "private": true,
  "scripts": {
    "test": "bun run test:unit && cucumber-js --config cucumber.config.js",
    "test:unit": "vitest run --config vitest.config.mts --silent='passed-only'"
  }
}
```

E2E 的 Vitest 配置使用 Node，扫描 `src/**/*.test.ts`。`cucumber.config.js` 通过 `tsx/cjs` 加载步骤和 support，扫描 `src/features/**/*.feature`，步骤 glob 排除 `*.test.ts`。Hooks 准备测试用户和登录会话，每个场景创建独立 BrowserContext，失败时附上截图和诊断信息。
