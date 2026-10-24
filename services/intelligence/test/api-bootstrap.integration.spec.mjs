import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PlanOrClarification, ResultOf } from '@vortex/contracts';
import * as F from '@vortex/fixtures';
import { createSigner } from '../../api/src/auth.ts';

it('boots the default API with B planning while keeping services labeled fixture', async () => {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const secret = randomBytes(48).toString('hex'); // Ephemeral fixture auth; never written or printed.
  const child = spawn(process.execPath, ['--import', 'tsx', 'services/api/src/server.ts'], {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)), windowsHide: true,
    env: { ...process.env, VORTEX_API_PORT: String(port), VORTEX_SERVICES: 'fixture', VORTEX_AUTH_SECRET: secret },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let timer;
  const exited = new Promise((resolve) => { child.once('exit', resolve); child.once('error', resolve); });
  const ready = new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output = (output + chunk.toString()).slice(-4000);
      if (output.includes(`Vortex API on http://localhost:${port}/v1`)) resolve();
    });
    child.stderr.on('data', () => {}); // Do not echo subprocess details or environment values.
    child.once('error', () => reject(Error('The fixture API process could not start.')));
    child.once('exit', () => reject(Error('The fixture API stopped before startup.')));
    timer = setTimeout(() => reject(Error('Fixture API startup timed out.')), 10_000);
  });
  try {
    await ready;
    const signer = await createSigner(secret);
    const token = await signer.sign({ userId: F.users.sam.id, deviceId: F.devices.samDesktop.id, deviceKind: 'desktop' });
    const post = (text) => fetch(`http://127.0.0.1:${port}/v1/plans`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: randomUUID(), text, deviceId: F.devices.samDesktop.id,
        snapshotRevision: F.snapshot.revision, selectedResourceIds: [] }),
    });
    const response = await post('Please resume workspace "Group Project".');
    expect(response.headers.get('X-Vortex-Services')).toBe('fixture');
    const result = ResultOf(PlanOrClarification).parse(await response.json());
    expect(result).toMatchObject({ ok: true, data: { kind: 'plan', workspaceId: F.workspaces.groupProject.id } });
    // The old canned planner returned a focus plan even for an unknown workspace.
    const unknown = await post('resume A Workspace That Does Not Exist');
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && !child.killed) child.kill();
    await exited;
  }
}, 20_000);
