import { resolveTabRequest } from './src/tab-router.mjs';

// MOCK DATA ONLY: no real browser inventory and no live sponsor integration.
export const demoResources = [
  { id: '11111111-1111-4111-8111-111111111111', kind: 'tab', title: 'Project Notes', revision: 3, capabilities: ['activate_tab'] },
  { id: '22222222-2222-4222-8222-222222222222', kind: 'tab', title: 'Project Article', revision: 1, capabilities: ['activate_tab'] },
  { id: '33333333-3333-4333-8333-333333333333', kind: 'tab', title: 'Travel Notes', revision: 2, capabilities: ['activate_tab'] },
];

const commands = process.argv.length > 2 ? [process.argv.slice(2).join(' ')] : [
  'switch to project notes', 'find notes', 'find missing article',
];
console.log('=== MOCK DATA DEMO: no real browser actions or AI connection ===');
for (const text of commands) {
  console.log(`\nRequest: ${text}`);
  const result = resolveTabRequest({ text, resources: demoResources });
  if (result.kind === 'resolved') {
    console.log(`Selected tab: ${result.title}`);
    console.log(result.intent === 'activate' ? 'Selected an activation target. No browser action was executed.' : 'Search result only. No activation was requested.');
    console.log(`Target ID: ${result.resourceId}, revision: ${result.expectedRevision}`);
  } else if (result.kind === 'ambiguous') {
    console.log(result.question);
    for (const candidate of result.candidates) console.log(`- ${candidate.title}`);
  } else {
    console.log(`${result.code}: ${result.message}`);
  }
}
