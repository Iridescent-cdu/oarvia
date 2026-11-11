---
name: dependency-upgrades
description: 按现有 taze 配置更新依赖；明确指定大版本时按新版本方式迁移，保持业务兼容。
---

# 依赖更新规则

- 常规依赖更新走项目已有 taze 命令，由现有配置决定安全版本范围、交互、写入和安装行为。
- 不自行改成 major/latest，不为执行更新重写已有配置；限定包时只缩小更新对象。仅查询不写入版本。
- 版本声明、catalog 引用和锁文件保持一致，内部依赖保留 workspace 协议，不混入无关升级。
- 用户明确指定目标大版本时，按官方迁移指南和推荐方式调整相关调用、配置与测试，清理被替代的旧实现。
- 不为沿用旧 API 新增包装层、新旧双实现、版本探测或旧入口转发；保留既有业务行为、数据、对外契约和用户流程。
- 补丁记录原因和适用版本；上游已解决或不再需要的补丁及时移除，仍承担必要功能的补丁可保留。

## 示例

已有 taze 配置时直接沿用。以下是递归扫描工作区、包含锁定依赖并交互写入的配置示例，放在 `taze.config.ts`：

```ts
import { defineConfig } from "taze";

export default defineConfig({
  recursive: true,
  includeLocked: true,
  interactive: true,
  write: true,
});
```

`package.json` 提供统一入口，更新范围继续由 taze 配置决定：

```json
{
  "scripts": {
    "dep:update": "taze"
  }
}
```

常规更新执行 `pnpm dep:update`。已有配置决定候选范围，不额外追加 major/latest；非交互执行按任务需求调整交互参数。
