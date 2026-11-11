---
name: skill-management
description: 管理自有技能的平铺源码与相对链接，区分第三方安装和来源记录。
---

# 技能管理规则

- 自有技能在技能库根目录的独立目录中保留唯一源码，由发现目录中的相对软链接暴露；不把整个发现目录做成软链接。
- 自有技能全部平铺在技能库根目录，使用 <技能名>/SKILL.md；技能清单为名称数组，名称全局唯一，使用小写连字符形式。
- 第三方技能以实体目录直接安装，不移入自有源码或纳入自有链接流程；保留来源、版本、安装位置和许可证。
- 链接脚本按自身位置定位清单，不依赖作者本机路径；保留现有接入命令，安装后恢复由使用方项目负责。
- 本地源码相对链接可提交；指向外部依赖包的链接作为生成产物，固定包版本并在安装后重建。
- 链接操作重复执行不产生变化，先检查所有冲突再创建；保留同名实体目录、错误或失效链接，不强制覆盖。
- 改名或移除只处理已确认属于本库的链接，不清空发现目录；不因一个技能任务批量安装第三方内容。
- 链接实现可复用随附的 [链接脚本](assets/link.mjs)，技能库自身不添加修改下游项目的安装钩子。

## 示例

每个自有技能直接占用技能库根目录下的一个目录，保留一份可编辑源码。发现目录通过相对链接引用；第三方技能保留实体目录：

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
    └── third-party/                            # 第三方实体目录
```

`skills/skills.json` 以名称数组登记真实存在的自有技能，不包含第三方目录：

```json
["example-rule", "another-rule"]
```

使用随附链接脚本时，在目标项目根 package.json 暴露接入命令，安装后可恢复发现链接：

```json
{
  "scripts": {
    "skills:link": "node skills/scripts/link.mjs .",
    "postinstall": "pnpm run skills:link"
  }
}
```

已有 postinstall 时合并原有命令；清单仅以名称数组登记真实存在的自有技能，第三方实体目录不纳入链接清单。

默认接入全部技能，也可按名称选择；重复选择去重，未知名称在创建任何链接前失败：

```sh
node skills/scripts/link.mjs . example-rule
```

组织技能包作为固定版本依赖安装时，从稳定入口接入，链接不绑定 pnpm 的版本化存储目录：

```sh
node --preserve-symlinks-main node_modules/@example/skills/scripts/link.mjs . example-rule
```

这类外部依赖链接按实际名称忽略，禁用安装钩子时显式重建；不忽略整个发现目录而丢掉第三方实体。平台缺少软链接权限时说明系统条件，不悄悄复制自有技能造成双源。
