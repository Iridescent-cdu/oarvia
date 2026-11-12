---
name: docker-compose
description: 组织子包 Dockerfile、Compose 编排和 env 配置，分开管理 Compose 参数与容器运行时配置。
---

# 容器编排规则

- Dockerfile 放在所属子包，入口脚本、Nginx 等运行文件随子包维护；构建上下文按依赖范围选择，可使用仓库根。
- 构建入口从 env 读取 Dockerfile 路径、构建上下文和镜像标签，不在脚本或其他配置中重复维护。
- Compose 参数 env 保存镜像、端口、资源名和业务 env 路径，由入口读取并通过 --env-file 提供给 Compose 插值。
- 容器运行时 env 保存数据库连接、密钥和业务配置，由服务 env_file 在创建容器时读取并注入环境变量。
- 业务 env 及其模板放在所属应用目录，本地开发与容器复用应用模板，容器差异通过 Compose 覆盖项处理。
- 服务器分别维护 Compose、编排参数 env 和业务 env；编排参数引用业务文件路径，不复制业务内容，业务配置不打进镜像。
- 应用读取容器环境变量，不持续读取宿主机 env 文件；修改注入值需要重新创建容器。
- --env-file 与服务 env_file 用途不同，不能互相替代；业务 env 需要参与插值时显式加载。
- 文件名、变量名、路径基准和覆盖顺序沿用项目约定；容器连接地址通过覆盖项处理，不改写原生开发配置。

## 示例

编排参数与业务配置分别按环境维护，Dockerfile 归所属子包。文件名和环境划分仅为示例，Compose 可按需拆分：

```text
项目根目录/
├── docker-compose.yml                # 编排，可按需要拆分或组合
├── docker-compose.development.env    # 开发编排参数
├── docker-compose.test.env           # 测试编排参数
├── docker-compose.production.env     # 生产编排参数
└── apps/service/
    ├── Dockerfile
    ├── docker-entrypoint.sh
    ├── .env.example                  # 应用环境变量模板
    └── .env                          # 本地业务配置，不提交
```

`docker-compose.development.env` 提供构建路径、本地镜像和端口，并指向开发业务 env：

```dotenv
BUILD_CONTEXT=.
SERVICE_DOCKERFILE=apps/service/Dockerfile
SERVICE_IMAGE=example-service:local
SERVICE_PORT=3000
SERVICE_RUNTIME_ENV=./apps/service/.env
```

`docker-compose.yml` 读取编排参数，再通过 env_file 将业务配置注入容器：

```yaml
services:
  service:
    image: ${SERVICE_IMAGE:?set SERVICE_IMAGE}
    env_file:
      - ${SERVICE_RUNTIME_ENV:?set SERVICE_RUNTIME_ENV}
    environment:
      SERVER_HOST: 0.0.0.0
    ports:
      - target: 3000
        published: ${SERVICE_PORT:-3000}
        host_ip: 127.0.0.1
```

`apps/service/.env.example` 提供应用共用模板，本地开发时复制为同目录的 `.env`。真实连接与密钥由对应环境提供，业务 env 不提交，也不复制进镜像。容器通过上面的 `environment` 覆盖监听地址，不另建一份容器模板：

```dotenv
NODE_ENV=development
SERVER_HOST=127.0.0.1
SERVER_PORT=3000
```

构建入口解析编排 env，将 SERVICE_DOCKERFILE、BUILD_CONTEXT、SERVICE_IMAGE 分别传给构建工具的文件、上下文和标签参数。运行入口按目标环境选择参数文件；下面分别展示开发和生产的调用：

```sh
# 开发环境
docker compose --env-file docker-compose.development.env -f docker-compose.yml up -d

# 生产环境
docker compose --env-file docker-compose.production.env -f docker-compose.yml up -d
```

每个环境的编排 env 提供对应镜像、端口、资源名及业务 env 路径；服务 env_file 再读取该环境的业务配置。相对路径按各自解析规则处理，不假定相对 env 文件所在目录。
