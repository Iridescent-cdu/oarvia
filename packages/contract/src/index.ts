import { oc } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
import { z } from "zod";

export const contract = {
  system: {
    health: oc
      .meta(
        openapi({ method: "GET", path: "/health", summary: "Service liveness" })
      )
      .output(
        z.object({ service: z.literal("oarvia-api"), status: z.literal("ok") })
      ),
    version: oc
      .meta(
        openapi({ method: "GET", path: "/version", summary: "Build identity" })
      )
      .output(
        z.object({
          ready: z.boolean(),
          revision: z
            .string()
            .regex(/^[a-f0-9]{40}$/u)
            .nullable(),
        })
      ),
  },
};
