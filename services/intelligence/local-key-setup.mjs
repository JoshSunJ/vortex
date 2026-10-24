import { startLocalKeySetup } from './src/local-key-setup.mjs';

try {
  const setup = await startLocalKeySetup();
  console.log(`Local setup page: ${setup.url}`);
  console.log('One-time, loopback-only setup. Expires after 10 minutes. No key values are logged.');
  const stop = async () => { await setup.close(); process.exitCode = 0; };
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
} catch {
  console.error('Could not start local setup. No key values were logged.');
  process.exitCode = 1;
}
