import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { verifyDeployment } from './verify-deployment.mjs';

const current = 'a'.repeat(40), previous = 'b'.repeat(40);
const image = `example/app@sha256:${'a'.repeat(64)}`;
const oldImage = `example/app@sha256:${'b'.repeat(64)}`;

test('waits for readiness and exact revision, rather than accepting HTTP 200', async () => {
  let calls = 0;
  await verifyDeployment({ url: 'https://example.com/version', revision: current, attempts: 3,
    pause: async () => {}, request: async () => {
      const states = [{ ready: true, revision: previous }, { ready: false, revision: current }, { ready: true, revision: current }];
      return { ok: true, json: async () => states[calls++] };
    } });
  assert.equal(calls, 3);
});

test('network failures exhaust the retry budget and fail', async () => {
  let calls = 0;
  await assert.rejects(verifyDeployment({ url: 'https://example.com', revision: current, attempts: 2,
    pause: async () => {}, request: async () => { calls++; throw new Error('offline'); } }));
  assert.equal(calls, 2);
});

test('invalid deployment identity fails before a request', async () => {
  await assert.rejects(verifyDeployment({ url: 'https://example.com', revision: 'main' }));
  await assert.rejects(verifyDeployment({ url: 'https://user:secret@example.com', revision: current }));
});

function simulate(mode, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-test-'));
  const bin = join(dir, 'bin');
  // 独立临时目录，不访问真实 Docker、服务器或网络；flock 仅模拟获取结果。
  const mkdir = spawnSync('/bin/mkdir', [bin]);
  assert.equal(mkdir.status, 0);
  writeFileSync(join(dir, 'compose.yaml'), 'services: {}\n');
  writeFileSync(join(dir, 'production params.env'), 'COMPOSE_PROJECT_NAME=example\nSERVICE_PORT=3100\nSERVICE_RUNTIME_ENV=apps/service/.env\nSERVICE_IMAGE=example/app:old\n');
  const originalParams = readFileSync(join(dir, 'production params.env'), 'utf8');
  if (mode === 'pending') writeFileSync(join(dir, 'deployment-pending.txt'), 'interrupted');
  if (mode === 'old-report') writeFileSync(join(dir, 'deployment-result.txt'), 'status=verified\n');
  writeFileSync(join(bin, 'flock'), '#!/bin/sh\nexit "${FAKE_LOCK_RESULT:-0}"\n', { mode: 0o755 });
  writeFileSync(join(bin, 'node'), '#!/bin/sh\nif [ "$EXPECTED_SHA" = "$OLD_SHA" ]; then exit 0; fi\n[ "$FAKE_MODE" = success ] || [ "$FAKE_MODE" = wrong-running-image ]\n', { mode: 0o755 });
  writeFileSync(join(bin, 'docker'), `#!${process.execPath}
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2), e = process.env;
const selectedImage = e[e.IMAGE_VARIABLE];
appendFileSync(e.LOG_FILE, JSON.stringify({ args, image: selectedImage }) + '\\n');
const stateFile = e.LOG_FILE + '.state';
const running = existsSync(stateFile) ? readFileSync(stateFile, 'utf8') : e.OLD_IMAGE;
if (args[0] === 'image') console.log(args[3] === '{{.Id}}' ? args.at(-1) : (e.FAKE_MODE === 'wrong-image' ? 'invalid' : e.NEW_SHA));
else if (args[0] === 'inspect') console.log(args[2].includes('revision') ? e.OLD_SHA : running);
else if (args.includes('ps') && e.FAKE_MODE !== 'first-fails') console.log('old-container');
else if (args.includes('up') && ((e.FAKE_MODE === 'update-command-fails' && selectedImage === e.NEW_IMAGE) || (e.FAKE_MODE === 'rollback-fails' && selectedImage === e.OLD_IMAGE))) process.exit(1);
else if (args.includes('up')) writeFileSync(stateFile, e.FAKE_MODE === 'wrong-running-image' ? e.OLD_IMAGE : selectedImage);
`, { mode: 0o755 });
  const log = join(dir, 'commands.log');
  try {
    const result = spawnSync('bash', [fileURLToPath(new URL('./deploy-container.sh', import.meta.url))], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_MODE: mode, LOG_FILE: log,
        NEW_SHA: current, OLD_SHA: previous, OLD_IMAGE: oldImage, NEW_IMAGE: image,
        DEPLOY_DIR: dir, COMPOSE_FILE_PATH: 'compose.yaml', COMPOSE_ENV_FILE: 'production params.env',
        IMAGE_VARIABLE: 'SERVICE_IMAGE', COMPOSE_SERVICE: 'api', IMAGE_REPOSITORY: 'example/app',
        DEPLOY_IMAGE: image, EXPECTED_SHA: current, DEPLOYMENT_HEALTH_URL: 'https://example.com/version',
        ...(mode === 'old-report' ? { DEPLOY_RESULT_FILE: join(dir, 'this-attempt.txt') } : {}), ...overrides }, encoding: 'utf8',
    });
    return { status: result.status, stderr: result.stderr, pending: existsSync(join(dir, 'deployment-pending.txt')),
      paramsUnchanged: readFileSync(join(dir, 'production params.env'), 'utf8') === originalParams,
      report: existsSync(join(dir, 'deployment-result.txt')) ? readFileSync(join(dir, 'deployment-result.txt'), 'utf8') : '',
      attemptReport: existsSync(join(dir, 'this-attempt.txt')),
      commands: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [] };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('successful update records verified state and clears pending', () => {
  const result = simulate('success');
  assert.equal(result.status, 0); assert.equal(result.pending, false);
  assert.match(result.report, /status=verified/);
});

for (const mode of ['verify-fails', 'update-command-fails', 'wrong-running-image']) {
  test(`${mode}: restores original digest and retains failed exit status`, () => {
    const result = simulate(mode);
    assert.equal(result.status, 1); assert.equal(result.pending, false);
    assert.match(result.report, /status=failed-restored/);
    assert.deepEqual(result.commands.filter((c) => c.args.includes('up')).map((c) => c.image), [image, oldImage]);
  });
}

test('failed first installation and failed restoration retain pending state', () => {
  for (const mode of ['first-fails', 'rollback-fails']) {
    const result = simulate(mode);
    assert.equal(result.status, 1); assert.equal(result.pending, true);
    assert.match(result.report, /status=failed-needs-inspection/);
  }
});

test('wrong image identity, mutable input and a busy lock never update containers', () => {
  for (const result of [simulate('wrong-image'), simulate('success', { DEPLOY_IMAGE: 'example/app:latest' }),
    simulate('success', { FAKE_LOCK_RESULT: '1' })]) {
    assert.notEqual(result.status, 0, JSON.stringify(result));
    assert.equal(result.commands.some((c) => c.args.includes('up')), false);
  }
});

test('interrupted deployment blocks reentry; old report does not become this attempt result', () => {
  const pending = simulate('pending');
  assert.notEqual(pending.status, 0); assert.equal(pending.pending, true);
  assert.equal(pending.commands.length, 0);
  const failed = simulate('old-report', { DEPLOY_IMAGE: 'example/app:latest' });
  assert.notEqual(failed.status, 0); assert.equal(failed.attemptReport, false);
  assert.match(failed.report, /verified/);
});

test('update and rollback reuse the selected Compose files without changing parameter env', () => {
  const result = simulate('verify-fails', { IMAGE_VARIABLE: 'API_IMAGE' });
  assert.equal(result.status, 1); assert.match(result.report, /failed-restored/);
  assert.equal(result.paramsUnchanged, true);
  const calls = result.commands.filter((c) => c.args[0] === 'compose');
  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.deepEqual(call.args.slice(0, 5), ['compose', '--env-file', 'production params.env', '-f', 'compose.yaml']);
  }
  assert.deepEqual(calls.filter((c) => c.args.includes('up')).map((c) => c.image), [image, oldImage]);
});

test('missing parameter file and invalid image variable stop before Docker operations', () => {
  for (const result of [simulate('success', { COMPOSE_ENV_FILE: 'missing.env' }),
    simulate('success', { IMAGE_VARIABLE: 'PATH' }), simulate('success', { IMAGE_VARIABLE: 'DEPLOY_IMAGE' }),
    simulate('success', { IMAGE_VARIABLE: 'API_IMAGE;echo injected' })]) {
    assert.notEqual(result.status, 0); assert.equal(result.commands.length, 0);
  }
});

test('real Compose resolves parameter env and business env separately with a digest override', {
  skip: spawnSync('docker', ['compose', 'version']).status !== 0,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'compose config test '));
  try {
    mkdirSync(join(dir, 'apps/api'), { recursive: true });
    const params = `COMPOSE_PROJECT_NAME=example-production\nAPI_IMAGE=${oldImage}\nAPI_PORT=3100\nAPI_RUNTIME_ENV=./apps/api/.env\n`;
    const business = "DATABASE_URL=postgres://example/db\nLITERAL='$(touch should-not-exist)'\n";
    writeFileSync(join(dir, 'production params.env'), params);
    writeFileSync(join(dir, 'apps/api/.env'), business);
    writeFileSync(join(dir, 'docker-compose.yml'), 'services:\n  api:\n    image: ${API_IMAGE:?}\n    env_file:\n      - ${API_RUNTIME_ENV:?}\n    ports:\n      - "127.0.0.1:${API_PORT}:3000"\n');
    const env = { ...process.env };
    for (const key of ['COMPOSE_PROJECT_NAME', 'API_IMAGE', 'API_PORT', 'API_RUNTIME_ENV']) delete env[key];
    for (const target of [image, oldImage]) {
      const result = spawnSync('docker', ['compose', '--env-file', 'production params.env', '-f', 'docker-compose.yml', 'config', '--format', 'json'], {
        cwd: dir, env: { ...env, API_IMAGE: target }, encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      const config = JSON.parse(result.stdout);
      assert.equal(config.name, 'example-production');
      assert.equal(config.services.api.image, target);
      assert.equal(config.services.api.ports[0].published, '3100');
      assert.equal(config.services.api.environment.DATABASE_URL, 'postgres://example/db');
      // config 会把字面 $ 转义为 $$；核验值保留且没有执行其中的命令。
      assert.equal(config.services.api.environment.LITERAL.replaceAll('$$', '$'), '$(touch should-not-exist)');
    }
    assert.equal(readFileSync(join(dir, 'production params.env'), 'utf8'), params);
    assert.equal(readFileSync(join(dir, 'apps/api/.env'), 'utf8'), business);
    assert.equal(existsSync(join(dir, 'should-not-exist')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
