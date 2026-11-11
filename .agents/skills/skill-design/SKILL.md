---
name: skill-design
description: 设计、编写和优化技能，从实际实践提炼中文规则，并用文案串联通用示例。
---

# 规则

- 名称使用小写连字符，描述简短说明能力和适用任务；规则与说明使用中文，工具名称、配置键和代码保留原名。
- 正文先集中列规则，再用一个 `## 示例` 章节平铺示例。一级标题可直接写规则主题，不为不同示例类型另设标题，也不穿插重复规则。
- 从实际实践提炼核心模式、职责边界、必要约束和例外，不照搬项目实现，也不只写空泛建议。删重复说明，不为缩短篇幅丢掉关键内容。
- 示例不设数量或篇幅上限，按不同写法和边界充分覆盖；优化已有技能时对照原正文与参考资料，只合并重复，不删除有独立意义的规则、配置、例外和示例。
- 示例按需要选用目录、配置、代码或前后对照，不凑齐类型。用简短文案交代场景、设计意图或前后关系，再展示内容；不只堆文件名和代码块。
- 示例保留真实语法与关键逻辑，去掉业务名称、专用地址、本机路径和无关特例。目录只展示关键归属，示例名称、布局和数量不成为固定要求。
- 相关示例的文件名、导入、变量和配置保持一致；说明影响使用的前提与可选项。省略实现的骨架明确标注，不冒充完整可运行代码。
- 必要顺序写成规则，不扩展成通用的读取、验证和交付流程，不另设 references。配置修改不代表授权执行安装、部署或数据操作。
- 同一约定只维护一处，项目专用内容留在项目配置或指令中。调整规则时同步修改示例，清理冲突和过时内容。
- 每个技能直接放在技能库根目录的 <技能名>/SKILL.md，所有技能目录平级；名称、源码目录、名称数组清单和发现链接保持一致，接入方式遵循 skill-management。

## 示例

下面是一个完整技能，保存为技能库根目录下的 `module-testing/SKILL.md`，与其他技能目录平级，清单登记名称 `module-testing`。正文集中列规则，再用文案串联目录、配置和代码示例；其中的项目目录树说明测试代码如何组织，不是技能源码的存放位置。

````markdown
---
name: module-testing
description: 编写模块行为测试，约定测试位置、运行环境和断言方式。
---

# 规则

- 测试放在源码旁，文件名使用 *.test.ts。
- 纯逻辑模块使用 Node 测试环境，断言公开返回值和错误行为。
- 测试与运行配置分开，不为了一个用例重复创建整套测试工程。

## 示例

测试与源码就近维护，共用一份运行配置。下面仅展示文件归属：

```text
项目根目录/
├── vitest.config.ts
└── src/
    ├── parseName.ts
    └── parseName.test.ts
```

使用 Vitest 的纯逻辑项目，在 `vitest.config.ts` 中选择 Node 环境，并扫描源码旁的测试：

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

`parseName.ts` 去除名称两侧的空白，名称为空时抛错：

```ts
export const parseName = (value: string): string => {
  const name = value.trim();
  if (!name) throw new Error("名称不能为空");
  return name;
};
```

`parseName.test.ts` 通过公开函数断言这两项行为，不依赖内部实现：

```ts
import { expect, it } from "vitest";
import { parseName } from "./parseName";

it("去除名称两侧空白", () => {
  expect(parseName(" Alice ")).toBe("Alice");
});

it("拒绝空白名称", () => {
  expect(() => parseName(" ")).toThrow("名称不能为空");
});
```
````
