import { contract } from "@oarvia/contract";
import { implement } from "@orpc/server";

const api = implement(contract);
const revision = process.env.OARVIA_BUILD_REVISION ?? null;

export const router = api.router({
  system: {
    health: api.system.health.handler(() => ({
      service: "oarvia-api",
      status: "ok",
    })),
    version: api.system.version.handler(() => ({
      ready: revision !== null,
      revision,
    })),
  },
});
