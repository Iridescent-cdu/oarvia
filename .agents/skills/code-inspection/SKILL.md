---
name: code-inspection
description: 配置代码诊断、格式化、未使用依赖分析、样式检查和编辑器基础规范。
---

# 代码质检规则

- 采用 Ultracite 时默认使用 Oxc：oxlint 负责代码诊断，oxfmt 负责格式化；版本使用受支持的组合。
- Knip 独立分析未使用文件、导出和依赖；有样式源码时再接入 Stylelint，SCSS 和平台语法按实际需要配置。
- 沿用已有明确工具链，同一源码不叠加相互竞争的格式器或规则。类型检查由 TypeScript 检查器负责。
- 共享规则集中配置，框架和平台差异就近覆盖；依赖由实际加载配置、执行工具的包声明，版本遵循项目 catalog 归属。
- 代码检查与格式化加载同一套预设，忽略范围明确排除生成内容；不通过扩大忽略或关闭规则掩盖问题。
- 根检查命令聚合代码、Knip、类型、测试及实际存在的样式检查；Ultracite 已覆盖的诊断和格式扫描不重复执行。
- 检查命令保持只读，修复和格式化另设入口；CI 与本地使用同一套规则。
- Knip 报告是清理线索，删除前考虑动态加载、框架入口、构建引用和对外接口。
- EditorConfig 与格式器统一编码、换行和缩进，语言特例按文件类型覆盖。

## 示例

共享配置放在项目根目录，工具从同一入口加载；样式检查只在有对应源码时接入：

```text
项目根目录/
├── package.json           # 检查与修复命令
├── oxlint.config.ts       # 代码规则
├── oxfmt.config.ts        # 格式规则
├── knip.json              # 工作区与入口
├── stylelint.config.mjs   # 有样式时配置
└── .editorconfig          # 基础格式
```

以下采用 Ultracite 的 Oxc 方案。`oxlint.config.ts` 加载基础和 Vitest 规则；没有 Vitest 测试时去掉对应预设：

```ts
import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  env: core.env,
  extends: [core, vitest],
  ignorePatterns: core.ignorePatterns,
  settings: core.settings,
});
```

`oxfmt.config.ts` 使用同一方案的格式预设，不再叠加其他格式器：

```ts
import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig(ultracite);
```

`knip.json`，工作区范围与实际成员保持一致，框架入口由插件识别，额外脚本显式补充：

```json
{
  "$schema": "./node_modules/knip/schema.json",
  "workspaces": {
    ".": { "entry": ["taze.config.ts", "scripts/*.mjs"] },
    "apps/*": {},
    "packages/*": {}
  }
}
```

存在 CSS/SCSS 时，`stylelint.config.mjs` 分别加载对应规则；只有 CSS 时去掉 SCSS 覆盖与依赖：

```js
export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: ["**/dist/**", "**/coverage/**"],
  overrides: [
    {
      files: ["**/*.scss"],
      extends: ["stylelint-config-standard-scss"],
    },
  ],
  reportNeedlessDisables: true,
};
```

`package.json` 的命令片段，假定源码使用 TypeScript、测试使用 Vitest；没有样式时去掉样式命令及其聚合项：

```json
{
  "scripts": {
    "check:code": "ultracite check",
    "fix:code": "ultracite fix",
    "check:unused": "knip",
    "lint:styles": "stylelint \"{apps,packages}/**/*.{css,scss}\"",
    "lint:styles:fix": "stylelint \"{apps,packages}/**/*.{css,scss}\" --fix",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "check": "pnpm check:code && pnpm check:unused && pnpm lint:styles && pnpm typecheck && pnpm test"
  }
}
```

`.editorconfig` 补充跨编辑器的基础格式，缩进和换行与格式器保持一致：

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```
