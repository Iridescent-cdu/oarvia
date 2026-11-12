import { describe, expect, it } from "vitest";

import { readConfig } from "./config";

describe("server configuration", () => {
  it("defaults to a local development listener", () => {
    expect(readConfig({})).toStrictEqual({ host: "127.0.0.1", port: 3000 });
  });

  it("reads a container listener from the environment", () => {
    expect(readConfig({ HOST: "0.0.0.0", PORT: "4000" })).toStrictEqual({
      host: "0.0.0.0",
      port: 4000,
    });
  });

  it.each(["", "-1", "0", "65536", "NaN", "3000.5"])(
    "rejects invalid PORT %s",
    (port) => {
      expect(() => readConfig({ PORT: port })).toThrow(/PORT/u);
    }
  );
});
