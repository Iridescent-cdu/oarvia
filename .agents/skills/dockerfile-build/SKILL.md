---
name: dockerfile-build
description: 编写应用 Dockerfile，约定构建分层、依赖安装、运行文件和容器启动方式。
---

# 镜像构建规则

- 按 base、builder、app、最终运行阶段分工：构建环境、编译与依赖整理、运行文件和权限组装、启动配置。
- ARG 靠近使用阶段声明，ENV 按用途分组；用于 FROM 的全局 ARG 在阶段内使用时重新声明。
- 工具版本与项目清单一致；先复制清单、锁文件和必要补丁，再冻结安装依赖，保留原生模块安装脚本。
- 构建缓存不进入最终镜像；生产镜像只保留启动所需的产物、依赖、入口、迁移文件、静态资源和包元数据。
- Node 镜像按应用兼容性选择基础发行版，不混用 glibc 与 musl；只有运行依赖完整时才使用 scratch。
- 裁剪运行环境时保留加载器、链接库、符号链接、CA 证书、字体及动态加载资源，不能只依赖 ldd 的结果。
- 最终阶段使用实际存在的非 root 用户，必要目录可写；Nginx 的监听端口、PID 和临时目录适配运行身份。
- 入口和命令使用 exec 形式；入口脚本通过 exec 转交应用进程，保留外部 worker 和迁移入口。
- 业务配置在运行时注入，密钥不进入 ARG、ENV 或镜像；构建确需凭据时使用秘密挂载。
- 镜像源和证书校验遵循项目约定，不通过关闭 TLS 或随意替换源处理构建失败。

## 示例

服务端和前端各自维护 Dockerfile 与运行文件，构建辅助脚本随所属子包放置：

```text
项目根目录/
├── package.json
├── pnpm-workspace.yaml
└── apps/
    ├── service/
    │   ├── Dockerfile
    │   ├── docker-entrypoint.sh
    │   └── scripts/            # 按需放运行库收集等构建辅助脚本
    └── web/
        ├── Dockerfile
        └── nginx.conf
```

分层骨架如下，注释处由项目的实际构建逻辑补齐，不是独立可构建的完整文件：

```dockerfile
ARG NODEJS_VERSION="24"

FROM node:${NODEJS_VERSION}-alpine AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
# 先复制工作区清单与锁文件，再按依赖范围冻结安装
# 复制源码并构建，用 pnpm deploy 整理生产产物到 /out
# 收集 Node、原生模块运行库和证书到 /runtime

FROM busybox:musl AS app
COPY --from=builder /runtime/ /
COPY --from=builder /out/ /app/
# 复制入口脚本，准备运行用户、目录与权限

FROM scratch
COPY --from=app / /
ENV NODE_ENV="production"
WORKDIR /app
USER 1001:1001
CMD ["/bin/node", "apps/service/dist/main.js"]
```

服务端在 builder 整理应用产物和运行库，app 组装文件与权限；静态前端在 builder 编译，用 Nginx 作为 app 阶段组装静态资源和配置。最终阶段只声明运行环境、身份及启动方式。
