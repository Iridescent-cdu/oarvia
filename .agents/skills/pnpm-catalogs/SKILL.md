---
name: pnpm-catalogs
description: 按消费包管理 pnpm catalog，约定依赖归属、版本声明和安装方式。
---

# 依赖目录规则

- 根工作区依赖放默认 catalog，引用 catalog:；每个子包使用自己的命名 catalog，引用 catalog:<组名>。
- 组名从包名确定，必要时保留 scope 信息避免重名；同一依赖被多个包使用时，各包自己的组分别声明。
- 采用 catalogMode: prefer、catalogPrune: true、saveExact: true，目标 pnpm 版本须支持；已有明确策略按项目约定。
- prefer 允许回退到直接版本，不会自动选择子包分组；根新增依赖使用 --save-catalog，子包使用 --save-catalog-name。
- 依赖由实际消费包声明，dependencies、devDependencies 和 peerDependencies 按用途决定；不因精确版本策略收窄对外 peer 契约。
- 内部依赖保留 workspace 协议，Git、本地路径和别名来源按实际协议处理，不机械改成仓库精确版本。
- 每个 catalog 只有一个配置所有者；沿用已有 include 委托，不重复定义默认组或分散维护同组条目。
- catalogPrune 会清理未使用条目，预置依赖须考虑实际引用；依赖声明、分组和锁文件保持一致。
- 日常安装只调整相关依赖；只有明确要求整理时才迁移分组，整理不顺带升级版本或改变依赖字段。

## 示例

版本定义集中维护，根包和子包分别引用自己的 catalog；以下用一个应用展示归属：

```text
项目根目录/
├── pnpm-workspace.yaml    # 根 catalog 与子包 catalogs
├── pnpm-lock.yaml
├── package.json           # 根依赖引用 catalog:
└── apps/service/
    └── package.json       # 子包依赖引用 catalog:service
```

`pnpm-workspace.yaml` 中，根工具 taze 放默认组，应用使用的 zod 放 service 组。版本仅为示例：

```yaml
packages:
  - apps/*
  - packages/*

catalogMode: prefer
catalogPrune: true
saveExact: true

catalog:
  taze: 21.3.0

catalogs:
  service:
    zod: 4.6.7
```

根 `package.json` 引用默认组，不再单独写版本：

```json
{
  "devDependencies": {
    "taze": "catalog:"
  }
}
```

`apps/service/package.json` 引用自己的命名组：

```json
{
  "name": "@example/service",
  "private": true,
  "dependencies": {
    "zod": "catalog:service"
  }
}
```

后续安装沿用消费包的归属：

```sh
pnpm add -w taze --save-catalog
pnpm --filter @example/service add zod --save-catalog-name service
```
