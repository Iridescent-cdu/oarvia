---
name: pnpm-workspace
description: 组织 pnpm 工作区成员、包命名、包清单和内部依赖边界。
---

# 工作区规则

- 应用作为运行或部署单元，共享包作为可复用能力；按真实职责拆包，不为目录模板制造空包。
- 目录使用小写连字符命名，默认包名为 @组织名/目录名，末级目录与包名对应；scope 来自组织约定，不从本机用户名猜测。
- 应用与共享包采用同一命名规则，工作区包名唯一，不额外套多层 scope 或隐藏项目前缀。
- 工作区清单只覆盖真实成员，避免宽泛匹配纳入测试副本、示例或独立嵌套项目。
- 根包和不发布的包设为 private，packageManager 固定 pnpm 版本；只有一个包时不强制拆成多包。
- 内部依赖显式使用 workspace 协议；依赖由实际消费包声明，不依赖根包或偶然提升。
- 应用消费共享包，共享包不反向依赖应用；通过公开 exports 或明确子路径访问，不跨包引用私有源码。
- 源码导出或构建产物按消费方式选择，入口指向实际内容；根脚本按依赖关系聚合命令，避免循环依赖。

## 示例

应用和共享能力分别放置，成员数量与目录名按项目决定：

```text
项目根目录/
├── package.json           # 聚合命令，不发布
├── pnpm-workspace.yaml    # 实际成员
├── apps/
│   └── web/
│       ├── package.json
│       └── src/
└── packages/shared/
    ├── package.json       # 公共 exports
    └── src/
```

`pnpm-workspace.yaml` 只匹配实际包目录，避免把测试副本或嵌套项目纳入：

```yaml
packages:
  - apps/*
  - packages/*
```

`apps/web/package.json` 声明应用自身消费的共享包：

```json
{
  "name": "@example/web",
  "private": true,
  "dependencies": {
    "@example/shared": "workspace:*"
  }
}
```

`packages/shared/package.json` 通过 exports 暴露源码，由应用打包器转译；发布给普通 Node 消费者时改用实际构建产物：

```json
{
  "name": "@example/shared",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
```
