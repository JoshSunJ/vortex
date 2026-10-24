import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { resolveWorkspaceRequest } from './src/workspace-router.mjs';

const deviceId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const tabId = '33333333-3333-4333-8333-333333333333';
const windowId = '44444444-4444-4444-8444-444444444444';
const sourceId = '55555555-5555-4555-8555-555555555555';
const phoneId = '66666666-6666-4666-8666-666666666666';

// MOCK records only. These subsets are router inputs, not full wire fixtures.
const demoInput = {
  deviceId,
  workspaces: [{ id: workspaceId, deviceId, name: 'Group Project', resourceIds: [tabId, windowId] }],
  resources: [{ id: tabId, deviceId, kind: 'tab' }, { id: windowId, deviceId, kind: 'window' }],
  selectedResourceIds: [tabId, windowId], primaryTabId: tabId, primaryWindowId: windowId,
  goal: 'Research public sources for the group project', sourceIds: [sourceId],
  userNote: 'I have not finished reading the article and need comparison sources.',
  recipient: { deviceId: phoneId },
};
const samples = [
  'find project research',
  'create workspace "Group Project"',
  'focus Group Project',
  'save checkpoint "Group Project"',
  'send brief "Group Project"',
  'resume Group Project',
];
const labels = {
  find: 'Search sources', create_workspace: 'Create a workspace from selected resources',
  focus_workspace: 'Request a workspace focus plan', save_checkpoint: 'Request a checkpoint',
  send_brief: 'Request brief creation and delivery', resume_workspace: 'Request a workspace resume plan',
};

function show(commandText) {
  console.log(`\nInput: ${commandText}`);
  const decision = resolveWorkspaceRequest({ ...demoInput, text: commandText });
  if (decision.kind === 'command') {
    console.log(`Intent: ${labels[decision.command.kind]}`);
    console.log(JSON.stringify(decision.command, null, 2));
    console.log('Status: command resolved only. Nothing was saved, delivered, or executed.');
  } else if (decision.kind === 'ambiguous') {
    console.log(decision.question);
    for (const candidate of decision.candidates) console.log(`- ${candidate.name} (${candidate.workspaceId})`);
  } else {
    console.log(`${decision.code}: ${decision.message}`);
  }
}

console.log('=== MOCK WORKSPACE COMMAND DEMO ===');
console.log('No real tabs, windows, phone, AI, or accounts are connected. All IDs and selections are examples.');
if (process.argv.includes('--interactive')) {
  console.log('Example: resume Group Project');
  console.log('Type exit or quit to stop.');
  const reader = createInterface({ input: stdin, output: stdout });
  try {
    for await (const line of reader) {
      if (['exit', 'quit'].includes(line.trim())) break;
      show(line);
    }
  } finally { reader.close(); }
} else if (process.argv.length > 2) {
  show(process.argv.slice(2).join(' '));
} else {
  for (const sample of samples) show(sample);
}
