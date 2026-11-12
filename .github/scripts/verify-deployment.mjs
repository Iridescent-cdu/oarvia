import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const requestRevision = async (request, endpoint, revision, attempt) => {
  endpoint.searchParams.set("deployment_check", `${Date.now()}-${attempt}`);
  try {
    const response = await request(endpoint, {
      headers: { "Cache-Control": "no-cache" },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return false;
    }
    const body = await response.json();
    return body?.ready === true && body.revision === revision;
  } catch {
    return false;
  }
};

export const verifyDeployment = async ({
  url,
  revision,
  attempts = 12,
  delayMs = 5000,
  request = fetch,
  pause = delay,
}) => {
  if (!/^[a-f0-9]{40}$/u.test(revision ?? "")) {
    throw new Error("Expected a full source SHA");
  }
  const endpoint = new URL(url);
  if (
    !["https:", "http:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password
  ) {
    throw new Error("Expected HTTP(S) URL without embedded credentials");
  }
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 60) {
    throw new Error("Invalid attempt limit");
  }
  const attempt = async (index) => {
    if (await requestRevision(request, endpoint, revision, index)) {
      return;
    }
    if (index + 1 === attempts) {
      throw new Error(
        "Deployment did not become ready at the expected revision"
      );
    }
    await pause(delayMs);
    return attempt(index + 1);
  };
  await attempt(0);
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await verifyDeployment({
      revision: process.env.EXPECTED_SHA,
      url: process.env.DEPLOYMENT_HEALTH_URL,
    });
    console.log("Running revision verified");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
