import { z } from "zod";

const configSchema = z.object({
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

export const readConfig = (environment: NodeJS.ProcessEnv) => {
  const config = configSchema.parse(environment);
  return { host: config.HOST, port: config.PORT };
};
