# Oarvia 开发入口

- 项目结构与常用命令见 [开发说明](docs/development.md)；产品定位见 [README](README.md)。
- 修改前读取适用的 [.agents/skills](.agents/skills)：工作区与依赖使用 `pnpm-workspace`、`pnpm-catalogs`、`pnpm-settings`；工具链使用 `mise-environment`、`bun-runtime`。
- 增删或接入技能时读取 `skill-management`；项目自有技能源码放 `skills/`，登记于 `skills/skills.json`，管理命令见[开发说明](docs/development.md#技能管理)。
- 引入、使用或维护 UI 组件时读取 `ui-components`；共享组件统一归 `packages/ui`（`@oarvia/ui`），通过官方 ReUI MCP 查询上游组件与示例。
- API 使用 oRPC v2。修改接口时读取 `orpc`、`orpc-contract`；涉及 REST 或文档时再读取 `orpc-openapi`，按其要求查询当前官方文档。
- 代码组织、检查与测试分别遵循 `source-layout`、`code-inspection`、`test-infrastructure`；文档遵循 `documentation-governance`。
- CI 工作流遵循 `continuous-integration`，按 test、e2e、codeql 和 bundle-size 分工。
- 部署配置与上线验证遵循 `continuous-deployment`；容器部署同时读取 `docker-compose` 与 `dockerfile-build`。
- `packages/contract` 只定义公开契约，不依赖应用；服务实现位于 `apps/api`。生产代码保持 Node 兼容。
- 提交前执行 `mise exec -- bun run ci`。不修改已安装 Skill 来规避项目检查。
- 分支、PR 与合并读取 `git-workflow`；提交、准备版本、分发产物分别读取 `git-commit`、`version-release`、`release-publish`。项目操作流程与首次启用条件见[发布说明](docs/release.md)。
