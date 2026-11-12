import { once } from "node:events";
import type { AddressInfo } from "node:net";

import type { contract } from "@oarvia/contract";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApiServer } from "./server";

describe("API transport", () => {
  const server = createApiServer();
  let origin: string;

  beforeAll(async () => {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (!server.listening) {
      return;
    }
    const closed = once(server, "close");
    server.close();
    server.closeIdleConnections();
    await closed;
  });

  it("calls the shared contract through the RPC client", async () => {
    const client: RouterContractClient<typeof contract> = createORPCClient(
      new RPCLink({ origin, url: "/rpc" })
    );
    await expect(client.system.health()).resolves.toStrictEqual({
      service: "oarvia-api",
      status: "ok",
    });
  });

  it("serves the same procedure over REST", async () => {
    const response = await fetch(`${origin}/api/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      service: "oarvia-api",
      status: "ok",
    });
  });

  it("reports an unstamped source server without accepting a requested revision", async () => {
    const response = await fetch(
      `${origin}/api/version?revision=${"a".repeat(40)}`
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toStrictEqual({
      ready: false,
      revision: null,
    });
  });

  it("publishes the health operation in the OpenAPI specification", async () => {
    const response = await fetch(`${origin}/api/spec.json`);
    expect(response.status).toBe(200);
    const spec = await response.json();
    expect(spec).toMatchObject({
      info: { title: "Oarvia API" },
      paths: {
        "/health": { get: { responses: { "200": expect.any(Object) } } },
      },
    });
  });

  it("returns 404 for unmatched requests", async () => {
    const response = await fetch(`${origin}/missing`);
    expect(response.status).toBe(404);
  });

  it("does not permit GET on the RPC transport", async () => {
    const response = await fetch(`${origin}/rpc/system/health`);
    expect(response.status).toBe(404);
  });

  it("rejects a malformed RPC body and keeps serving requests", async () => {
    const response = await fetch(`${origin}/rpc/system/health`, {
      body: "{",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(400);
    const health = await fetch(`${origin}/api/health`);
    expect(health.status).toBe(200);
  });
});
