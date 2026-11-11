---
name: npmrc-config
description: 维护 pnpm 项目中认证、镜像源与安装设置的配置边界。
---

# 安装配置文件规则

- pnpm 12 的 .npmrc 仅保留认证、registry 配置及必要中文注释，项目安装设置放在 pnpm-workspace.yaml。
- 保留实际需要的认证和镜像源配置，不写入真实凭据，不修改用户全局配置。

## 示例

认证与镜像源、安装设置、解析结果分别归属以下文件：

```text
项目根目录/
├── .npmrc                 # 认证引用与镜像源
├── pnpm-workspace.yaml    # 项目安装设置
└── pnpm-lock.yaml         # 锁定解析结果
```

pnpm 12 的 `.npmrc`：

```ini
# pnpm 12 仅从此文件读取认证和镜像源设置；项目安装设置位于 pnpm-workspace.yaml。
```

项目确需指定镜像源时追加：

```ini
registry=https://registry.npmjs.org/
```
