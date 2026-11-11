---
name: mise-environment
description: 用 mise 管理项目工具版本及统一命令执行环境。
---

# 项目工具链规则

- 项目只维护一套 mise 配置，沿用既有文件名；仅声明实际使用的工具并固定具体版本，不使用 latest。
- pnpm 版本与 packageManager 精确一致，Node 版本符合项目支持范围；不重复叠加其他项目版本管理来源。
- mise 管工具版本与执行环境，业务命令由项目脚本实现；mise 任务需要时只做薄委托。
- 终端、编辑器任务和 CI 使用同一配置，非交互环境通过 mise exec 调用，不另写一套工具版本。
- 不在进入目录时自动安装、改数据库或发布；不修改用户全局工具和 Shell 偏好，不全局跳过配置信任。

## 示例

工具版本与业务命令分别维护，终端和自动化使用同一份工具链配置：

```text
项目根目录/
├── mise.toml              # 工具版本
└── package.json           # 业务命令与 packageManager
```

`mise.toml` 固定实际工具版本；以下版本仅作示例，按目标项目支持范围调整：

```toml
[tools]
node = "24.22.2"
pnpm = "12.16.1"
bun = "1.4.3"
```

`package.json` 中的 pnpm 版本与 mise 一致，Node 范围表达应用的实际支持契约：

```json
{
  "packageManager": "pnpm@12.16.1",
  "engines": {
    "node": ">=24.22.2 <25"
  }
}
```

自动化通过相同工具链执行已有项目命令：

```sh
mise exec -- pnpm install --frozen-lockfile
mise exec -- bun run check
```
