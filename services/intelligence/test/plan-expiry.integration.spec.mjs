import { describe, expect, it, vi } from 'vitest';
import { BrowserBridge } from '../../../apps/desktop/src/browser.ts';
import { ControlEngine } from '../../../apps/desktop/src/control.ts';
import { Journal } from '../../../apps/desktop/src/journal.ts';

describe('shared local planner expiry at the Owner B integration boundary', () => {
  it('uses one clock reading when deriving the two-minute plan lifetime', async () => {
    const epoch = Date.parse('2026-10-24T21:00:00.000Z');
    vi.useFakeTimers(); vi.setSystemTime(epoch);
    // Force a 1 ms tick between no-argument new Date() and Date.now().
    // Before the fix this produces a 120001 ms lifetime and self-rejection.
    vi.spyOn(Date, 'now').mockReturnValue(epoch + 1);
    const journal = new Journal(':memory:');
    try {
      // MOCK platform adapters. No native helper, network, or window focus.
      const windows = { list: async () => [{ handle: '42', processId: 100,
        processStartedAt: '2026-10-24T20:00:00.000Z', title: 'MOCK Notes', appName: 'MOCK Editor', active: true }],
      focus: vi.fn(async () => {}) };
      const engine = new ControlEngine(journal, new BrowserBridge(), windows);
      const snapshot = await engine.getSnapshot();
      const plan = await engine.planResourceFocus(snapshot.resources[0].id);
      expect(Date.parse(plan.expiresAt) - Date.parse(plan.createdAt)).toBe(120_000);
      expect(Date.parse(plan.createdAt)).toBe(epoch + 1);
      expect(windows.focus).not.toHaveBeenCalled();
    } finally {
      journal.close(); vi.restoreAllMocks(); vi.useRealTimers();
    }
  });
});
