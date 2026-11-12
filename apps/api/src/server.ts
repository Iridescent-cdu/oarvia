import { createServer } from "node:http";

import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { OpenAPIReferenceHandlerPlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/node";
import { ZodToJsonSchemaConverter } from "@orpc/zod";

import { router } from "./router";

export const createApiServer = () => {
  const rpc = new RPCHandler(router);
  const generator = new OpenAPIGenerator({
    converters: [new ZodToJsonSchemaConverter()],
  });
  const openapi = new OpenAPIHandler(router, {
    plugins: [
      new OpenAPIReferenceHandlerPlugin({
        spec: () =>
          generator.generate(router, {
            base: {
              info: { title: "Oarvia API", version: "0.0.0" },
              servers: [{ url: "/api" }],
            },
          }),
      }),
    ],
  });

  return createServer(async (request, response) => {
    response.setHeader("cache-control", "no-store");
    try {
      const rpcResult = await rpc.handle(request, response, { prefix: "/rpc" });
      if (rpcResult.matched) {
        return;
      }

      const apiResult = await openapi.handle(request, response, {
        prefix: "/api",
      });
      if (apiResult.matched) {
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "Not found" }));
    } catch (error) {
      console.error("Request failed", error);
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "Internal server error" }));
    }
  });
};
