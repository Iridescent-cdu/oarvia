---
name: documentation-governance
description: 分层组织项目文档与 agent 指令，通过 AGENTS.md 按需链接参考资料和技能，避免文档重复与散落。
---

# 文档组织规则

- 分层存放、按需读取、保持单一来源。优先更新已有内容，开发计划、排查过程和完成总结默认在聊天中交付。
- AGENTS.md 保持简洁，只放必要约束和读取入口，链接旁说明何时阅读。根文件管全局，子目录只补充局部差异，不逐层创建或重复规则。
- 项目专属的详细 agent 资料放 .agents/references/；可跨项目复用的做法沉淀为技能，通过 .agents/skills/ 发现。
- 技能接入遵循 skill-management，区分自有技能源码与第三方安装；文档引用实际的技能入口，不统一限定为链接接入。
- 不新增 README.md。除上述指令、参考资料和技能外，需要长期保存的项目文档统一放 docs/，按领域或用途分类，不预建空目录。
- 同一内容只维护一处，其他入口使用链接；配置值和 API 指向实际来源，不另写副本。迁移文档时保留有效内容，同步引用，不自动删除已有 README。
- 临时日志、截图和工具产物放已有产物目录或仓库外，不混入正式文档；仓库内产物精确忽略。

## 示例

以下仅展示归属关系，按实际需要创建文件。自有技能可通过相对链接暴露源码；第三方技能可通过 Vercel skills 等工具安装：

```text
项目根目录/
├── AGENTS.md
├── .agents/
│   ├── references/
│   │   └── architecture.md
│   └── skills/
│       └── coding/SKILL.md
└── docs/
    ├── usage/
    │   └── configuration.md
    └── operations/
        └── deployment.md
```
