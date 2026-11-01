// TEST FIXTURE ONLY. Never import from production composition or frontend code.
// Serializes transactions and commits a cloned snapshot only after all work
// succeeds. This models atomicity; it is NOT a durable database adapter.
export function syntheticRepository(seed) {
  let state = { records: {}, receipts: {}, effects: { assignees: [], notifications: [], submissions: [], releases: [] }, ...structuredClone(seed) };
  let tail = Promise.resolve();
  let failCommit = false;
  return {
    atomic: true, durable: false,
    snapshot: () => structuredClone(state),
    configure: patch => { state = { ...state, ...structuredClone(patch) }; },
    failNextCommit: () => { failCommit = true; },
    transaction(work) {
      const run = tail.then(async () => {
        const next = structuredClone(state);
        const result = await work({
          profile: id => next.profiles.find(p => p.id === id),
          settings: () => next.settings,
          assignments: () => next.assignments,
          subjects: () => next.subjects,
          get: id => next.records[id],
          put: row => { next.records[row.id] = structuredClone(row); },
          receipt: key => next.receipts[key],
          putReceipt: (key, receipt) => { next.receipts[key] = structuredClone(receipt); },
        });
        if (failCommit) { failCommit = false; throw new Error('Synthetic commit failure'); }
        state = next;
        return result;
      });
      tail = run.catch(() => {});
      return run;
    },
  };
}
