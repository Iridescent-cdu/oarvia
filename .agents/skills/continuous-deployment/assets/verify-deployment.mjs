import { pathToFileURL } from 'node:url';

export async function verifyDeployment({ url, revision, attempts = 12, delayMs = 5000,
  request = fetch, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Expected a full source SHA');
  const endpoint = new URL(url);
  if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
    throw new Error('Expected HTTP(S) URL without embedded credentials');
  }
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 60) throw new Error('Invalid attempt limit');
  for (let index = 0; index < attempts; index++) {
    try {
      endpoint.searchParams.set('deployment_check', `${Date.now()}-${index}`);
      const response = await request(endpoint, {
        redirect: 'error', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const body = await response.json();
        if (body?.ready === true && body.revision === revision) return;
      } else {
        await response.body?.cancel();
      }
    } catch {
      // 有限重试启动、网络和版本传播失败；不输出响应体或带凭据的地址。
    }
    if (index + 1 < attempts) await pause(delayMs);
  }
  throw new Error('Deployment did not become ready at the expected revision');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyDeployment({ url: process.env.DEPLOYMENT_HEALTH_URL, revision: process.env.EXPECTED_SHA })
    .then(() => console.log('Running revision verified'))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
