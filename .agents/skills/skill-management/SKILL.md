---
name: skill-management
description: 管理自有技能的平铺源码与相对链接，区分第三方安装和来源记录。
---

# 技能管理规则

- 自有技能在技能库根目录的独立目录中保留唯一源码，由发现目录中的相对软链接暴露；不把整个发现目录做成软链接。
- 自有技能全部平铺在技能库根目录，使用 <技能名>/SKILL.md；技能清单为名称数组，名称全局唯一，使用小写连字符形式。
- 第三方技能通过 Vercel skills 等工具安装，不移入自有源码或纳入自有链接流程；安装工具负责生成实体目录或发现链接，保留来源、版本、安装位置和许可证。
- 安装或升级第三方技能前核对同名入口及本地修改，不覆盖自有技能或其他来源的安装。升级通过安装工具执行，不手工改写来源哈希；需要修改内容时在上游或明确的自有派生源码中维护。
- 链接脚本按自身位置定位清单，不依赖作者本机路径；保留显式接入命令，由开发者在初始化、增删技能或需要恢复链接时执行。
- 本地源码相对链接可提交；指向外部依赖包的链接作为生成产物，固定包版本，在依赖安装或更新后显式重建。
- 链接操作重复执行不产生变化，先检查所有冲突再创建；保留同名实体目录、错误或失效链接，不强制覆盖。
- 改名或移除只处理已确认属于本库的链接，不清空发现目录；不因一个技能任务批量安装第三方内容。
- 链接实现可复用随附的 [链接脚本](assets/link.mjs)。技能库和使用方项目均不将技能链接接入 postinstall 等依赖安装生命周期；依赖安装、CI 和生产镜像构建不要求技能目录或链接存在。

## 示例

每个自有技能直接占用技能库根目录下的一个目录，保留一份可编辑源码。下面以第三方技能使用 copy 模式安装为例：

```text
项目根目录/
├── skills/
│   ├── skills.json
│   ├── example-rule/SKILL.md                 # 唯一源码
│   ├── another-rule/SKILL.md                 # 与其他技能平级
│   └── scripts/link.mjs
└── .agents/skills/
    ├── example-rule -> ../../skills/example-rule
    ├── another-rule -> ../../skills/another-rule
    └── third-party-rule/                       # 第三方安装副本
```

`skills/skills.json` 以名称数组登记真实存在的自有技能，不包含第三方目录：

```json
["example-rule", "another-rule"]
```

使用随附链接脚本时，在目标项目根 package.json 暴露手动接入命令：

```json
{
  "scripts": {
    "skills:link": "node skills/scripts/link.mjs ."
  }
}
```

初始化、增删自有技能或需要恢复链接时，在项目根目录执行：

```sh
pnpm run skills:link
```

已有 postinstall 保持原有职责，不追加技能链接命令，也不为执行该命令向生产镜像复制技能目录。清单仅以名称数组登记真实存在的自有技能，第三方技能不纳入链接清单。

默认接入全部技能，也可按名称选择；重复选择去重，未知名称在创建任何链接前失败：

```sh
node skills/scripts/link.mjs . example-rule
```

组织技能包作为固定版本依赖安装时，从稳定入口接入，链接不绑定 pnpm 的版本化存储目录：

```sh
node --preserve-symlinks-main node_modules/@example/skills/scripts/link.mjs . example-rule
```

这类外部依赖链接按实际名称忽略，在依赖安装或更新后手动执行接入命令重建；不忽略整个发现目录而丢掉已安装的第三方技能。平台缺少软链接权限时说明系统条件，不悄悄复制自有技能造成双源。

第三方技能通过 Vercel skills 安装时，从上游仓库选择所需技能和目标 agent。例如在项目根运行以下命令，仓库和技能名仅作示例：

```sh
pnpm dlx skills add example/agent-skills --skill third-party-rule --agent codex --copy --yes
```

该示例使用 copy 模式，将安装副本放入 .agents/skills/third-party-rule，并由 CLI 更新 skills-lock.json；自有技能清单仍为前面的 example-rule 和 another-rule。
