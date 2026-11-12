---
name: git-commit
description: 整理 Git 提交和 PR 标题，编写 Gitmoji 消息，配置暂存代码检查和提交消息校验。
---

# 提交规则

- 根据工作区、暂存内容、已有提交或 PR 标题确定本次范围；按目的选择文件或代码块，同一修复的实现与测试放在一起，保留范围外的改动和已发布历史。
- 提交消息使用英文 `<gitmoji> <type>(<scope>): <description>` 格式，scope 可省略，描述具体变化且不以句号结尾；直接使用 `@lobehub/commitlint-config`，不为发布 PR 标题扩展普通提交的 type 枚举。
- PR 和 issue 引用取自实际关联记录；破坏性变更使用 `!` 和 `BREAKING CHANGE:` 说明影响与迁移，不在消息中写入凭据、私人对话或生产数据。
- 使用 squash 时按消息规范整理最终合入的 PR 标题；保留多个提交时检查各条实际合入消息。发布分支的特殊标题由版本工作流识别。
- `pre-commit` 检查暂存代码，`commit-msg` 检查 Git 传入的消息文件；消息格式使用 preset，完整类型检查、测试和构建由相应检查入口执行。
- 接入 hook 时配置实际命令、依赖、执行权限和本仓库的 hooksPath，使用目标项目的工具链；已有安装准备脚本需合并职责，不覆盖其他准备动作，安装依赖时只接入 hook，不运行检查。
- 暂存检查默认只读，保留未暂存及部分暂存的内容；自动修复时明确改写与重新暂存行为，保留默认备份及隐藏、恢复未暂存改动的保护，不无条件暂存其他文件。
- 检查失败时阻止提交，不绕过失败的 hook。接入后在临时仓库验证通过、失败和部分暂存场景，不为测试制造业务提交。
- 配置检查、创建提交、推送和合并按用户授权执行；仅整理当前分支的提交时，不额外创建发行分支。

## 示例

登录修复和格式化混在同一文件时，先查看工作区、暂存区与最终 diff，再分块暂存登录修复及对应测试；其余格式化留在工作区，不重置文件，也不改写已发布历史。

下面三条分别描述功能、修复和版本清单更新：

```text
✨ feat(search): support filtering by owner
🐛 fix(auth): preserve the return URL after sign-in
🔖 chore(release): release version v1.9.0
```

type 与 Gitmoji 对应为 `✨ feat`、`🐛 fix`、`💄 style`、`♻️ refactor`、`⚡ perf`、`👷 build`、`📝 docs`、`✅ test`、`🔧 chore`、`💚 ci`。热修复提交使用 `fix`，版本机器人使用 `chore(release)`；`🚀 release: ...` 是发布 PR 标题。Gitmoji 直接输入，无需 gitmoji-cli。

响应结构发生破坏性变更时，把调用方需要采取的迁移动作写入正文：

```text
✨ feat(api)!: return paginated search results

BREAKING CHANGE: read results from the items field instead of the response root
```

整理已有 PR 的 squash 消息时，使用该 PR 的标题并附 `(#PR编号)`；保留多个提交时检查实际合入的各条消息。分支来源、PR 目标与合并方式作为本次任务的输入，不根据提交 type 擅自切换分支或发起发布。

下面提供消息规则及本地检查入口：

| 示例文件 | 目标位置 | 用途 |
| --- | --- | --- |
| [commitlint.config.mjs](assets/commitlint.config.mjs) | 根目录 `commitlint.config.mjs` | 通过 extends 加载原 preset |
| [pre-commit](assets/pre-commit) | `.githooks/pre-commit` | 执行暂存代码检查 |
| [commit-msg](assets/commit-msg) | `.githooks/commit-msg` | 使用 --edit "$1" 校验消息，不改写消息 |
| [lint-staged.config.mjs](assets/lint-staged.config.mjs) | 根目录 `lint-staged.config.mjs` | 为检查器传递暂存文件 |

消息检查的开发依赖是 `@commitlint/cli`、`@lobehub/commitlint-config`；暂存检查示例另需 `lint-staged`、`ultracite`，通过 pnpm 安装并提交锁文件。根 `package.json` 暴露示例 hook 调用的命令：

```json
{
  "scripts": {
    "check:staged": "lint-staged"
  }
}
```

示例工具环境使用根 `mise.toml`，`pre-commit` 通过 mise 和 Bun 执行命令，`commit-msg` 通过 mise 和 pnpm 执行 Commitlint；其他环境替换对应调用即可。消息文件参数 `"$1"` 保持引用，兼容含空格的路径。

lint-staged 为 `ultracite check` 追加文件参数，并隐藏、恢复部分暂存文件的未暂存内容。示例匹配 `*`，由 Ultracite 按已有配置处理支持的文件及忽略范围；换用其他检查器时，按其支持的文件类型调整匹配。

```sh
chmod +x .githooks/pre-commit .githooks/commit-msg
git config core.hooksPath .githooks
mise exec -- bun run check:staged
```

可在根 `prepare` 设置 hooksPath，并在没有 Git 工作树的构建环境跳过。临时仓库中分别验证合法代码与消息通过、错误代码或消息阻止提交、部分暂存内容保持原样。

需要自动修复时，将 lint-staged 任务换成已有修复命令；它会重新暂存修复结果，后续检查读取修复后的暂存内容，不在 hook 中执行 `git add -A`。分支级类型检查只在有明确需求时增加，不复制参考仓库的过时分支名、包体积脚本或业务限制。
