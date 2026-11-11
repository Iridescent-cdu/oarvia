---
name: typescript-config
description: 约定 TypeScript 配置继承、运行环境、模块解析和包入口。
---

# 类型配置规则

- 优先沿用根 tsconfig，只有环境、检查范围或产物需求不同才新增子配置；不要求每包配置或额外配置包。
- 默认 strict；其他严格选项按项目需要启用，不为消除错误降低约束或扩大排除范围。
- DOM、JSX、Node 和测试类型按实际环境配置，不向所有包注入同一组全局类型。
- 打包器消费通常使用 ESNext、Bundler 和 noEmit；Node 直接运行编译后的 ESM 使用匹配的 NodeNext 与可解析后缀。
- 内部包可直接导出源码，由消费者转译；对外包按消费契约提供实际 JavaScript 和声明文件。
- 跨包消费走公开入口，paths 别名同时适配构建、测试和运行时，不只满足类型解析。
- 配置继承注意相对路径、include、exclude 和 paths 的覆盖，不为形式分层复制整套选项。
- 类型检查与构建、测试执行分开；只有实际使用增量构建或声明依赖图时才启用 composite 和 references。
- 沿用项目框架兼容的检查器，不因参考项目不同而替换工具链。

## 示例

共用选项留在根配置，确有独立环境的应用通过子配置覆盖；源码与产物出口仍归包自身：

```text
项目根目录/
├── tsconfig.json          # 共用配置
├── apps/
│   ├── web/src/
│   └── service/
│       ├── tsconfig.json  # 有独立环境时覆盖
│       └── src/
└── packages/shared/src/   # 由消费方式决定源码或产物出口
```

面向打包器的 React 项目，根 `tsconfig.json` 覆盖前端与适用的共享包，独立服务端由自己的配置检查：

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "esModuleInterop": true
  },
  "include": ["apps/web/src", "packages"],
  "exclude": ["node_modules", "dist", "coverage"]
}
```

`apps/service/tsconfig.json` 继承共用选项，覆盖 Node 类型环境和检查范围；这里假定服务也由打包器构建：

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "lib": ["ESNext"],
    "types": ["node"]
  },
  "include": ["src"]
}
```

主要应用和独立服务分别检查，根 package.json 可聚合实际入口：

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit && tsc --noEmit -p apps/service/tsconfig.json"
  }
}
```

直接用 tsc 编译供 Node 运行时，服务端改用匹配的 NodeNext 模块配置和输出目录。
