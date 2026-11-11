---
name: source-layout
description: 约定代码的目录归属、文件命名、公共导出、测试位置和文件转目录方式。
---

# 代码组织规则

- 顶层目录沿用项目约定，前端领域与路由、后端领域按项目已有架构组织；环境中有 spa-routes、backend-domains 技能时按需读取，不为套模板重排已有项目。
- 新组件目录使用 PascalCase，入口为 index.tsx；Hook 导出 useXxx，其他模块默认 camelCase，类文件与类名一致，共享包目录使用 kebab-case。已有明确命名约定的包保持一致。
- 新模块默认具名导出；框架页面、布局、配置、资源加载器等明确要求默认导出时例外。移动模块保留原导出名称、形式及公共签名。
- 前端独立组件放在所属范围的 components/<Component>/index.tsx；领域入口负责公共出口或顶层组合，已明确归属的布局和 Provider 不再机械套重复目录。
- 前端独立 Hook、工具、常量和内部类型分别放在就近的 hooks、utils、constants、types；类别仅有一个模块时直接在 index 中实现，不增加只转发唯一文件的薄入口。
- 同类确有多个职责模块时再拆文件，由 index 明确导出公共成员；组件仍各用自己的目录。不按函数数量机械拆分，也不创建空类别目录。
- 单个组件专用逻辑留在组件范围，同领域复用再上提领域，跨领域复用再放应用公共模块或共享包；局部常量和类型可留在实现中，不强行提取。
- 非前端模块不强套组件分类目录。少量同级共享逻辑可用 utils.ts、types.ts、constants.ts，样式用 style.ts；不新增语义重复或模糊的 const、type、styles、helpers 模块。
- 公共响应类型归共享契约，不复制进领域内部 types；入口只导出约定成员，保留必要轻量子路径，避免骨架或小程序主包经聚合导出加载重依赖。
- 单模块测试与源码同级，目录入口对应 index.test；用例较多或跨模块集成时可就近使用 __tests__。共享设施的归属遵循 [test-infrastructure](../test-infrastructure/SKILL.md)，不借组织目录迁移全仓测试。
- 大测试按场景拆分，保留含 JSX 文件的扩展名；同组测试可共享 testUtils.ts，但每个测试文件保留自身有提升语义的 mock 声明。行为取舍沿用项目已有测试约定；环境中有 testing 技能时按需读取。
- 手写源码和测试默认单文件上限为 1200 行，项目有明确上限时采用该值。新超限同次拆分，已有超限文件不再增长；生成文件和纯本地化资源可豁免，不靠改名规避。
- 拆分按状态所有权、业务子域、复用或执行阶段，而非任意行数。抽取到原模块自己的范围，不把职责散到邻域；多宿主共享能力另按依赖边界设计。
- 文件转目录先保留行为与公共入口，再提取同级职责模块，测试跟随移动。已有 index 时直接在其旁拆分；静态导入、动态导入、mock 和包 exports 都属于消费者。
- 目录入口解析不是所有运行时的默认能力；显式扩展名或原生 Node ESM 需要保留薄入口或调整 exports，不能只凭目录树认定公共路径不变。
- 组件入口保留组合与必要共享状态，Service 保留公共方法与编排，router 保留聚合，Store 保留公开 action；不因拆分将函数强改为类，也不反向改造已有类结构。
- 文件大小按完整文件计算，包含拆分后的嵌套文件；生成物等豁免以真实来源判断，不用目录总行数替代单文件限制。实际 gate 只有告警也不代表超限文件可以继续增长。
- Hook 含 JSX 时使用 index.tsx；单模块分类目录直接实现，多模块才显式转导出。不以导出聚合让轻量消费者隐式加载整个重领域。

## 示例

前端领域按所属范围组织；下面保留单模块直接实现、多模块拆文件、组件私有逻辑和同级测试的关系，实际只创建需要的目录：

```text
前端源码根/
├── features/Order/
│   ├── index.ts                     # 领域公共出口
│   ├── components/
│   │   ├── OrderList/
│   │   │   ├── index.tsx
│   │   │   ├── style.ts
│   │   │   └── hooks/index.ts       # 只服务此组件
│   │   └── OrderDetail/index.tsx
│   ├── hooks/
│   │   ├── index.ts                 # 明确导出多个 Hook
│   │   ├── useFetchOrders.ts
│   │   └── useOrderSelection.ts
│   ├── utils/
│   │   ├── index.ts                 # 单模块直接实现
│   │   └── index.test.ts
│   ├── constants/index.ts
│   └── types/index.ts               # 领域内部类型
└── components/EmptyState/index.tsx   # 跨领域组件
```

服务端仍按业务归属收拢，不复制前端的分类目录。以下用一个领域展示协议入口、业务与数据访问；只有一个实现的模块不必再拆目录：

```text
服务端源码根/
└── domains/order/
    ├── trpc.ts                      # tRPC 消费者存在时
    ├── http.ts                      # REST 消费者存在时
    ├── service/
    │   ├── index.ts                 # 公共方法与业务编排
    │   ├── createOrder.ts
    │   └── cancelOrder.ts
    ├── model.ts                     # 数据访问
    ├── model.test.ts
    └── __tests__/
        └── orderFlow.test.ts        # 跨模块协作
```

多个 Hook 的出口显式列出公共成员；单模块 utils/index.ts 则直接实现，不再多放一个同义文件：

```ts
// hooks/index.ts
export { useFetchOrders } from "./useFetchOrders";
export { useOrderSelection } from "./useOrderSelection";
```

文件转目录前后的结构如下。仅在消费者支持目录入口解析时，原有 `./OrderService` 导入可保持不变；否则维护实际入口映射：

```text
拆分前/
├── OrderService.ts
└── OrderService.test.ts

拆分后/
└── OrderService/
    ├── index.ts                     # 保留原公共接口
    ├── index.test.ts
    ├── createOrder.ts
    └── cancelOrder.ts
```

相同的 index 文件名在不同模块中承担不同职责，不能为了入口“足够薄”把有效编排分散出去：

| 模块 | 入口保留 | 内部提取 |
| --- | --- | --- |
| 组件 | 顶层组合、最小必要状态 | 子组件、复杂 Hook、纯计算 |
| Service | 公共方法、业务编排 | 查询、映射、独立执行阶段 |
| router | procedure 聚合与协议出口 | 按领域组织的 procedure |
| Store | 公开 action、slice 组合 | selector、状态转换、独立 action |

文件转目录还要检查测试发现、动态 import、mock 路径和包 exports。Node ESM 等环境不支持原来的目录解析时，保留明确的薄文件入口或调整已授权的映射，不能仅凭 TypeScript 能解析就认定运行时可用。
