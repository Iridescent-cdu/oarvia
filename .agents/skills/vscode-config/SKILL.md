---
name: vscode-config
description: 约定项目共享的编辑器设置、扩展建议、格式化和类型工具来源。
---

# 编辑器配置规则

- 项目只提交可共享的编辑器配置，不提交个人主题、字体、快捷键、用户目录或本机工具路径。
- 保存格式化和代码修复与命令行工具一致，不同时配置相互竞争的格式器或导入排序。
- 无既定方案时采用 Ultracite 的 Oxc 工具链及对应扩展；已有明确方案则沿用其官方扩展。
- EditorConfig 统一基础格式；有样式工具时再配置对应扩展和语言范围，Knip 保持命令行检查。
- 使用 catalog 时可推荐 Catalog Lens；扩展建议不代表自动安装，也不替代项目本地依赖。
- TypeScript 使用项目实际安装的 SDK，没有对应依赖时不写无效路径；多版本项目按各自环境解析。
- 仅排除实际生成的大目录，不隐藏配置、技能或锁文件；合并已有团队设置，不改用户全局偏好。

## 示例

团队设置和扩展建议归 .vscode，实际工具依赖归项目清单，基础格式由 EditorConfig 管理：

```text
项目根目录/
├── .vscode/
│   ├── settings.json      # 团队设置
│   └── extensions.json    # 扩展建议
├── .editorconfig
└── package.json           # 实际工具依赖与命令
```

采用 Oxc 和 pnpm 时，`.vscode/settings.json` 统一保存修复、格式器与项目 TypeScript SDK：

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "oxc.oxc-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.oxc": "explicit"
  },
  "npm.packageManager": "pnpm",
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "files.watcherExclude": {
    "**/node_modules/**": true,
    "**/dist/**": true,
    "**/coverage/**": true
  }
}
```

`.vscode/extensions.json` 推荐同一工具链的扩展；推荐只用于提示安装，不代替本地工具依赖：

```json
{
  "recommendations": [
    "oxc.oxc-vscode",
    "antfu.pnpm-catalog-lens",
    "editorconfig.editorconfig"
  ]
}
```

配置了 Stylelint 再加入对应扩展和保存修复；未安装根 TypeScript 时省略 SDK 两项，不向无关语言强行套用格式器。
