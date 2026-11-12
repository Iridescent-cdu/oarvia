---
name: continuous-integration
description: 配置和维护持续集成工作流，组织代码检查、测试、构建、安全扫描与产物体积验证。
---

# 持续集成规则

- 按职责组织 test、e2e、codeql 与 bundle-size：分别负责基础检查与构建、应用端到端验证、安全扫描、产物体积回归。缺少对应场景、平台权限或测量入口时暂不接入该流程，记录缺口，不建立恒绿的空检查。
- test 覆盖项目实际存在的代码诊断、格式校验、未使用依赖检查、类型检查、测试和生产构建。工具规则遵循 code-inspection，测试配置遵循 test-infrastructure；分步执行与本地聚合脚本选择一种，避免重复运行。
- 检查保持只读，修复使用单独入口；CI 不自动修复源码，不通过修改锁文件或解除冻结安装解决依赖冲突。
- 工具版本沿用项目配置，依赖冻结安装；mise、pnpm 和 Bun 的使用分别遵循 mise-environment、pnpm-settings 与 bun-runtime。已有其他工具链时保留，不因复制模板迁移运行时。
- PR 默认用 pull_request 验证合并结果。确需测试源提交时固定 head SHA，并另外验证与目标分支的集成结果；报告标明实际被测 SHA。
- 长期分支 push 验证合入结果，任务分支避免重复触发同一套 push 与 PR 检查。采用合并队列时，为必需检查接入 merge_group；未使用队列时无需开启。
- 必需工作流保留稳定触发入口；按变化跳过昂贵任务时，在工作流内部记录不适用原因。路径筛选涵盖源码及其共享依赖、锁文件、工具配置和工作流自身，运行时导入的文档也属于构建输入。
- 不同权限、触发条件或执行环境使用独立工作流；内部 job 按真实依赖编排。小项目可顺序执行，耗时或平台差异增加后再拆分；平台矩阵、数据库服务和镜像构建只覆盖实际支持范围。
- 同一 PR 或分支更新时取消过时 CI，各 job 设置超时。重复的环境准备可抽成 composite action；缓存只加速安装，缓存缺失仍能正确执行。
- 普通检查使用最小读权限，checkout 默认不保留凭据。PR 安装、构建与测试不接触发布密钥；需要写权限的评论或上传使用独立可信路径，不通过 pull_request_target 或高权限 workflow_run 执行不可信 PR 代码及 artifact。
- 数据库集成测试等待独立测试服务健康后再迁移和测试，并行时隔离数据。测试环境不连接生产资源；依赖数据库扩展或真实协议行为时使用兼容服务。
- e2e 先构建生产产物，再启动生产入口、等待就绪、执行场景并清理进程。构建只执行一次；优先复用框架的服务生命周期能力，没有该能力时由项目脚本管理。
- 按宿主选择 E2E 设施：纯 API 使用生产进程和真实协议请求，浏览器场景再安装 Playwright 等依赖。Web E2E 的工作区归属遵循 test-infrastructure，不要求纯 API 为运行测试引入浏览器或空的 Web 测试包。
- E2E 失败保留服务日志、截图、trace 或报告；项目脚本的输出位置与 artifact 路径一致。诊断上传失败或产物缺失不能掩盖原始测试结果。
- 测试按实际耗时决定是否分片及分片数量。分片报告使用唯一 artifact 名，同一覆盖率分组全部成功且报告齐全后再统一上传；失败或缺失分片不作为完整覆盖率发布。
- Codecov 等覆盖率服务按需接入，认证方式兼容所支持的 fork 场景；模块分组及回退容差由项目确定，不将外部服务固定为所有项目的前提。
- CodeQL 在仓库支持 code scanning 且具备对应权限时启用，扫描语言按实际源码选择。采用 advanced setup 时核对并迁移重复的 default setup；定时流程位于默认分支。
- 低频安全扫描可使用定时与手动入口；需要 PR 安全门禁时增加 PR、目标分支以及使用中的合并队列事件。只有定时扫描时，不将其检查绑定为每个 PR 都必须出现的状态。
- bundle-size 先确定必需产物、指标、压缩方式、报告 schema 与预算，预算由比较方配置，不由基线报告自行决定。总体积和首屏静态依赖体积分开测量；确需入口图时通过打包器 manifest 或可靠解析器区分静态与动态导入。
- 体积比较双方记录源码 SHA，使用兼容的测量工具、构建配置与环境。schema、指标或产物集合改变时显式迁移；新增目标使用明确预算，删除目标在报告中说明，不静默漏比。
- 重建 PR base 作为体积基线时，目标分支必须已有构建和测量入口。通过 PR 首次引入这些入口时，先测量当前产物，合入目标分支并确认测量成功后再启用比较，最后接入门禁；已有适用基线的项目可直接接入比较。
- 初始化结果只表示测量成功，不能报告预算通过。比较启用后的 base 构建失败属于检查失败，不降级为首次无基线。
- 复用历史基线时，只选择目标分支上属于被测提交祖先链的成功构建，核验 workflow、分支、SHA 和报告兼容性。首次缺失或过期时可记录未比较并初始化，不能把“未比较”报告为预算通过。
- 当前产物或报告缺失、空测量、无效数值、身份不符及 schema 不兼容都应失败。相对增幅与绝对下限可组合使用，阈值按产物确定。
- 提示报告与阻断检查分别定义。阻断步骤必须保留失败退出码；需要先生成或上传报告时可暂存结果，但最终恢复失败状态。
- 汇总 job 在依赖结束后执行，逐项核对必需结果。只有显式变化检测确认不适用的任务允许 skipped；失败、取消和意外跳过不能汇总成成功。
- 构建及报告 artifact 包含用途、SHA 和必要的分片或平台身份，按排障或基线需求设置保留期，内容不带密钥。CI 内镜像构建只作验证；预览上传、正式分发及部署按各自任务授权，分发遵循 release-publish。
- 自定义测量、比较和基线选择脚本验证正常、阈值边界、超限、新增目标、缺失报告及不兼容输入；工作流验证失败传播与 fork 无发布凭据场景。
- 区分模板完成、静态检查通过、真实运行通过和门禁启用。检查名变化时同步迁移分支保护，使用真实运行产生的检查绑定，合并门禁遵循 git-workflow；技能接入遵循 skill-management，不作为 CI 安装前提。

## 示例

模板以 GitHub Actions、mise、pnpm 和 Bun 为前提，示例分支为 main/canary。E2E 按宿主选择一份模板，体积检查按启用阶段选择一份；项目仍按 test、e2e、codeql 和 bundle-size 四类工作流组织。YAML 调用的项目命令需在使用方实际存在；Action 版本在接入时核对官方支持情况。

| 配置 | 入口 | 使用前准备 |
| --- | --- | --- |
| [test.yml](assets/test.yml) | PR、长期分支 push、手动 | 检查、测试和构建命令 |
| [e2e-api.yml](assets/e2e-api.yml) | PR、长期分支 push、手动 | 生产 API 启动入口、协议请求场景及诊断目录；复制为 e2e.yml |
| [e2e.yml](assets/e2e.yml) | PR、长期分支 push、手动 | 浏览器依赖、生产启动入口、Web 场景及诊断目录 |
| [codeql.yml](assets/codeql.yml) | 每周、手动 | code scanning 权限及 advanced setup |
| [bundle-size-initialize.yml](assets/bundle-size-initialize.yml) | PR、长期分支 push、手动 | 当前版本的构建与测量入口；初始化阶段复制为 bundle-size.yml |
| [bundle-size.yml](assets/bundle-size.yml) | PR | base 与当前版本均已有构建、测量入口及比较脚本 |

使用方的文件布局如下：

```text
项目根目录/
├── mise.toml
├── package.json
├── pnpm-lock.yaml
├── .github/workflows/
│   ├── test.yml
│   ├── e2e.yml
│   ├── codeql.yml
│   └── bundle-size.yml
└── e2e/                       # 存在浏览器 E2E 时接入
```

**基础检查。** [test.yml](assets/test.yml) 在 PR、main/canary 推送和手动入口执行，保持一个稳定的 check job；分支名按项目调整。依次运行下列入口，已存在等价脚本时直接改用它们，不重复执行聚合 check：

| 脚本 | 示例职责 |
| --- | --- |
| check:code | 代码诊断、格式校验 |
| check:unused | Knip 未使用依赖与导出检查 |
| typecheck | TypeScript 类型检查 |
| test | Vitest 等测试框架的非 watch 运行 |
| build | 项目生产构建 |

自定义 CI、版本与发布脚本的 Node 测试可由 test 聚合，或增加对应步骤。项目确需验证 Dockerfile 时，在 test 内增加独立步骤或 job，构建后启动测试容器并等待健康接口；不默认把正式镜像上传放入 test。

测试量增加后，可将 quality、app、server 拆为独立 job。下面的 job 片段展示 app 三片测试与一次 Codecov 上传，省略各 job 的 checkout、工具准备和冻结安装。前提是已有 app project、覆盖率插件及适合该仓库的 Codecov 认证；server 可使用另一分组。

```yaml
jobs:
  app:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3]
    steps:
      # 已完成检出、工具准备和冻结安装。
      - run: pnpm exec vitest run --project app --coverage --coverage.reportsDirectory=coverage/app --shard=${{ matrix.shard }}/3
      - uses: actions/upload-artifact@v6
        with:
          name: coverage-app-${{ github.sha }}-${{ matrix.shard }}
          path: coverage/app/lcov.info
          if-no-files-found: error
          retention-days: 1
  upload-app-coverage:
    needs: app
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      # 已完成检出，并按覆盖率服务配置认证。
      - uses: actions/download-artifact@v7
        with:
          pattern: coverage-app-${{ github.sha }}-*
          path: coverage-shards
      - name: Require all shard reports
        shell: bash
        run: |
          for shard in 1 2 3; do
            test -s "coverage-shards/coverage-app-${GITHUB_SHA}-${shard}/lcov.info"
          done
      - uses: codecov/codecov-action@v5
        with:
          files: coverage-shards/coverage-app-*/lcov.info
          disable_search: true
          flags: app
```

若要保持单一 check 门禁，下列 job 片段汇总 quality、app、server 的结果。此示例没有变化检测，三者必须全部执行成功；是否将覆盖率上传列为必需依赖由项目确定。

```yaml
check:
  needs: [quality, app, server]
  if: ${{ always() }}
  runs-on: ubuntu-latest
  timeout-minutes: 5
  steps:
    - env:
        QUALITY: ${{ needs.quality.result }}
        APP: ${{ needs.app.result }}
        SERVER: ${{ needs.server.result }}
      run: |
        test "$QUALITY" = success
        test "$APP" = success
        test "$SERVER" = success
```

**端到端验证。** 纯 API 使用 [e2e-api.yml](assets/e2e-api.yml)，复制到项目的 .github/workflows/e2e.yml。模板先执行 build，再执行根 test:e2e；后者可调用 node --test 运行生产进程测试，将诊断写到 artifacts/api-e2e。项目可按真实脚本调整这些入口，不需要浏览器安装步骤。

例如生产构建生成 apps/api/dist/main.mjs 时，test:e2e 的场景覆盖如下；执行脚本及协议断言由项目提供，模板不假定健康接口路径和响应结构：

| 阶段 | 纯 API 场景 |
| --- | --- |
| 启动 | 用 Node 子进程运行 main.mjs，使用独立本机端口和测试环境变量 |
| 就绪 | 在超时内请求实际健康接口，并检测进程是否提前退出 |
| 请求 | 验证成功响应、公开接口规范及错误请求后的恢复 |
| 退出 | 发送终止信号并检查退出结果；失败或超时也清理子进程 |
| 诊断 | 将服务输出保存在 artifacts/api-e2e，与上传路径一致 |

有 Web 场景时选择 [e2e.yml](assets/e2e.yml)，其中 e2e:install 安装浏览器与系统依赖，e2e:ci 管理服务启动及测试。以下是浏览器模板需要映射的接口，并非已提供的应用脚本：

| 入口或目录 | 约定 |
| --- | --- |
| e2e:install | 从已锁定的 Playwright 依赖安装 Chromium，包含 CI 系统依赖 |
| e2e:ci | 启动生产入口，等待就绪，运行场景，退出时清理；非零退出保留失败 |
| e2e/artifacts/ | 收集日志、截图、trace 与测试报告 |

下面采用 Playwright Test，假设 @example/e2e 已登记为私有工作区、声明已锁定的 @playwright/test，根 pnpm start 在 3000 端口启动生产产物。根 package.json 的命令片段如下，省略其他字段：

```json
{
  "scripts": {
    "e2e:install": "pnpm --filter @example/e2e exec playwright install --with-deps chromium",
    "e2e:ci": "pnpm --filter @example/e2e exec playwright test"
  }
}
```

e2e/playwright.config.ts 的关键配置如下；测试文件放 e2e/specs，端口和启动命令按应用调整。服务输出保留在工作流日志，截图、trace 和 HTML 报告进入模板上传的 e2e/artifacts：

```ts
import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  outputDir: './artifacts/results',
  reporter: [['list'], ['html', { outputFolder: './artifacts/report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm start',
    cwd: resolve(import.meta.dirname, '..'),
    url: 'http://127.0.0.1:3000',
    timeout: 60_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
```

已有 Cucumber + Playwright 时，e2e:ci 指向管理生产服务生命周期的执行脚本，诊断目录映射到 e2e/artifacts。需要 PostgreSQL 的项目可在对应 job 中合并以下片段；省略其他字段，镜像与扩展按实际数据库调整，迁移步骤插入冻结安装之后、构建之前：

```yaml
services:
  postgres:
    image: postgres:17
    env:
      POSTGRES_PASSWORD: test-password
    ports: ['5432:5432']
    options: >-
      --health-cmd pg_isready
      --health-interval 10s --health-timeout 5s --health-retries 5
env:
  DATABASE_URL: postgresql://postgres:test-password@localhost:5432/postgres
steps:
  # 前提是项目已有 db:migrate；这里只展示需插入的步骤。
  - run: mise exec -- bun run db:migrate
```

**安全扫描。** codeql.yml 每周及手动扫描 actions、javascript-typescript，采用 build-mode: none，不安装应用依赖。cron 使用 UTC，结果上传到 Security 页面。需要 PR 门禁时，可将模板 on 替换为下列片段；保留原权限和矩阵，按使用情况另加 merge_group：

```yaml
on:
  pull_request:
  push:
    branches: [main, canary]
  schedule:
    - cron: '27 4 * * 1'
  workflow_dispatch:
```

**体积回归。** bundle-size.yml 的 measure 矩阵分别构建 base SHA 与 merge SHA，compare 下载本次运行的两个 artifact。下表是模板与项目脚本的接口，脚本由使用方按实际打包器实现并测试：

| 调用 | 输入与输出 |
| --- | --- |
| bun run size:report --out 文件 | 读取 SIZE_SOURCE_SHA，测量必需目标，写出对应 SHA 的 JSON |
| bun run size:check --baseline 文件 --current 文件 --report 文件 | 用 SIZE_BASE_SHA、SIZE_CURRENT_SHA 核对报告身份，写 Markdown，并以退出码表达预算结果 |

若本次 PR 同时首次添加这些脚本，按下面的顺序接入；不要直接复制最终比较模板后要求初始 PR 通过它：

1. 将 [bundle-size-initialize.yml](assets/bundle-size-initialize.yml) 复制为项目的 .github/workflows/bundle-size.yml，与构建和测量脚本一起提交。该流程只测量当前提交，生成 artifact，并在 summary 标注未进行预算比较。
2. 初始化改动合入目标分支后，确认该分支的 push 运行生成有效测量报告。
3. 后续 PR 用最终 [bundle-size.yml](assets/bundle-size.yml) 替换同一路径的初始化流程，实际运行 base 与 merge 的比较；两份模板不同时安装。
4. 比较成功及超预算失败的路径验证后，再将 Compare Bundle Size 绑定为必需检查；初始化流程的 measure 不绑定为预算门禁。

报告可采用以下 schema。示例 SHA 用重复字符展示完整长度，真实值来自 checkout：

```json
{
  "schema": 1,
  "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "metrics": {
    "web-js-gzip": { "unit": "bytes", "value": 180000 }
  }
}
```

假设 web-js-gzip 基线为 180000、当前为 260000 字节，预算示例为 3% 与 64 KiB 下限：

```text
增长量：260000 - 180000 = 80000 bytes
允许增长：max(180000 × 3%, 65536) = 65536 bytes
结果：超出预算；先写 bundle-size-report.md，再非零退出
```

两种基线方案的接入方式如下：

| 情况 | 重建 PR base（随附模板） | 读取历史 artifact（可选优化） |
| --- | --- | --- |
| 首次接入 | 先将构建、测量入口合入目标分支 | 先由目标分支构建发布首份基线 |
| 基线来源 | 本次运行的 base SHA 构建结果 | 已核验的祖先链成功构建 |
| 无可用基线 | base 入口或构建缺失时失败 | 首次或过期可明确报告未比较并初始化 |
| 成本 | 每个 PR 两次构建 | 增加基线检索及兼容性校验，减少重复构建 |

比较脚本可用下表组织行为测试，具体数值与产物来自项目夹具：

| 输入 | 预期 |
| --- | --- |
| 未增长或刚好达到预算 | 成功并写报告 |
| 增长超过预算 | 写报告，非零退出 |
| 缺失报告、空产物、NaN 或负字节数 | 失败并指出无效输入 |
| 报告 SHA 与比较输入不符 | 失败，不使用该报告 |
| 新目标没有预算、指标或 schema 改变 | 要求明确配置或迁移，不静默跳过 |

**接入结果。** 复制所需 assets 后，用 actionlint 检查实际 YAML，再运行其底层项目命令。真实 PR 运行后，分别记录 test 的 check、E2E 的 e2e、Bundle Size 的 Compare Bundle Size 等检查结果，再迁移分支保护；定时 CodeQL 记录扫描结果即可。这里只配置 CI，不创建版本或执行产物分发。

配置语义以 [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)、[CodeQL workflow configuration](https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options) 和 [Playwright webServer](https://playwright.dev/docs/test-webserver) 为准。参考项目中的固定平台、分片数和路径不构成通用要求。
