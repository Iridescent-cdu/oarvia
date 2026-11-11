---
name: pnpm-settings
description: 约定 pnpm 的锁文件、版本解析、依赖暴露和脚本钩子设置。
---

# 安装策略规则

- 设置能力以项目固定的 pnpm 版本为准；pnpm 12 项目安装设置放 pnpm-workspace.yaml，认证与 registry 留在 .npmrc。
- 沿用适用的现有策略，不向所有项目复制一整套设置，不改用户全局配置。
- 启用 lockfile，将 pnpm-lock.yaml 纳入版本控制；开发环境正常安装更新锁文件，CI 使用 --frozen-lockfile。
- 不删除锁文件或取消冻结安装来绕过清单冲突；锁文件由包管理器生成，不手工改解析结果。
- 解析模式只在声明范围内选择版本，不将调整安装策略扩大为依赖升级。
- 先正确声明直接依赖和 peer 范围，再处理去重与 hoist；仅为实际需要添加最小 publicHoistPattern。
- 根工作区安装默认显式使用 -w，不为绕过根检查把依赖装到其他包。
- enablePrePostScripts 控制用户脚本钩子，不等于第三方依赖安装脚本许可；避免同一逻辑重复执行。

## 示例

安装策略归工作区配置，镜像源与认证归 .npmrc，解析结果由锁文件记录：

```text
项目根目录/
├── package.json           # 固定包管理器版本
├── pnpm-workspace.yaml    # 安装策略
├── pnpm-lock.yaml         # 提交到版本控制
└── .npmrc                 # 认证引用与镜像源
```

`pnpm-workspace.yaml` 的安装策略片段如下；成员和 catalog 继续按各自约定维护，字段以项目 pnpm 版本支持为准：

```yaml
lockfile: true
resolutionMode: highest
dedupePeerDependents: true
ignoreWorkspaceRootCheck: false
```

项目确需执行用户脚本的 pre/post 钩子时，再加入：

```yaml
enablePrePostScripts: true
```

锁文件纳入版本控制，自动化安装使用：

```sh
pnpm install --frozen-lockfile
```
