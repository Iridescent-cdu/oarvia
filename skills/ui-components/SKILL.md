---
name: ui-components
description: 在 Oarvia 中引入、使用和维护 shadcn/ui 与 ReUI 组件，约定 packages/ui 边界及 ReUI MCP 查询方式。
---

# UI 组件规则

- 共享组件统一维护在 `packages/ui`（`@oarvia/ui`），业务代码留在应用；通过公开子路径消费，不重复安装。
- 先复用本地组件，再查 shadcn/ui 和 ReUI；现有组件及组合无法满足需求时才新增实现。
- 新 UI 包采用 Base UI，保持底层和风格一致；实际 API 以本地源码和类型为准，不编造参数。
- 使用官方 ReUI MCP 查询组件、API 和示例；组件安装到 UI 包，依赖遵循项目工具链与 catalog 约定。
- 保留上游组件结构，自有组件遵循 `source-layout`；共享主题集中维护，优先使用语义 token 和组件变体。
- MCP 仅用于开发查询，不成为安装、运行、CI 或镜像构建的前置条件；付费资源遵循现有授权。
- 验证受影响的类型、交互、布局和数据状态；MCP 检查辅助本地验证，不替代它。

## 示例

首次有真实组件需求时再初始化 UI 包、工作区成员和导出，不因编写规则预建空包或批量安装组件。下面仅展示职责归属，按实际需求创建文件；`components.json` 的别名与公开导出应指向真实源码：

```text
packages/ui/
├── package.json                         # @oarvia/ui 的依赖和公开子路径
├── components.json                      # Base UI、风格、别名和 registry
└── src/
    ├── components/
    │   ├── ui/                          # shadcn 基础组件
    │   ├── reui/                        # ReUI 扩展组件
    │   └── EmptyState/index.tsx          # 自有通用组件
    ├── hooks/
    ├── lib/
    └── styles/globals.css               # 共享主题和样式入口
```

实现任务列表时，先查 UI 包的组件、导出和使用位置。通用控件优先使用 shadcn/ui；需要排序、分页等能力时查 ReUI Data Grid，简单静态表格使用 Table。任务查询、权限、业务字段和操作回调留在应用，通过参数、事件和插槽连接组件，UI 包不依赖应用或直接请求业务 API。

新增 ReUI 组件时，首次调用 `get_agent_skill` 并按任务读取相关主题，沿用官方组件使用和视觉规则。用 `search` 查找，读取 `get_component` 和 `get_examples`，再通过 `get_install_command` 获取命令；完整页面可先用 `compose_page` 参考布局。已有组件优先读本地实现，不为普通修改重复安装或查询全部资料。

执行安装前检查 `packages/ui/components.json` 中的底层、风格、别名和官方 registry，在 UI 包上下文运行 CLI，先比较已有文件，不默认覆盖。通过 mise 和 pnpm 执行，遵循 `bun-runtime` 的工具约定；组件依赖放 UI 包并使用 `catalog:ui`，应用显式声明 `@oarvia/ui` 的 `workspace:*` 依赖。安装后核对生成文件、版本和导入位置，避免组件或运行依赖散落到根包和应用。

应用通过已声明的子路径导入组件。例如公开了 `@oarvia/ui/button` 后，从该入口使用 Button，不导入 `@oarvia/ui/src/components/ui/button`；轻量控件不经过会加载表格等重依赖的聚合入口。上游文件保留原有命名和组合，移动时同步内部引用、CLI 别名及公开导出。不要根据本示例假定入口已存在。

MCP 给出上游最新示例、本地组件却缺少某个参数时，先核对版本和实现，明确升级需求，不直接套用，也不混用 Radix API 或顺带迁移底层。MCP 不可用时查本地源码或官方文档；付费资源不可用时尝试免费组件组合，仍无法满足则说明缺口，不自动购买或写入密钥。

调整外观时，应用复用 UI 包的主题和样式入口，优先用已有尺寸和外观变体；通用修改集中维护，避免调用处反复覆盖高度、圆角、内边距和阴影，保留组件交互及动画。主题、图标库和具体参数从本地配置读取。采用 ReUI 示例或区块时，通用组件归 UI 包，业务布局归应用，替换演示数据、空操作和示例链接。

修改完成后检查导出、依赖、类型和真实组合，验证受影响的键盘操作、焦点、响应式及深浅主题；数据区域补齐加载、空数据和错误状态。测试遵循 `test-infrastructure`，不复制机械的上游测试。新增 ReUI 用法可通过 `validate_usage`、`get_audit_checklist` 辅助核对，但本地扩展以已验证的实现为准。执行项目适用的检查和构建；尚无可运行消费者时，说明界面验证的限制。
