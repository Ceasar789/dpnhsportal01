// Test-only transactional stand-in. It never represents durable storage.
export function createSyntheticWeeklyJobRepository({ failCollectionCommit = false, references = false } = {}) {
  let state = { jobs: new Map(), receipts: new Map(), collections: new Map() };
  let tail = Promise.resolve();
  return {
    atomic: true, durable: false,
    transaction(callback) {
      const work = tail.then(async () => {
        const next = structuredClone(state);
        const tx = {
          getJob: id => next.jobs.get(id), putJob: job => next.jobs.set(job.id, job),
          listJobs: teacherId => [...next.jobs.values()].filter(item => item.teacherId === teacherId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          getReceipt: key => next.receipts.get(key), putReceipt: (key, receipt) => next.receipts.set(key, receipt),
          getCollection: id => next.collections.get(id),
          listCollections: teacherId => [...next.collections.values()].filter(item => item.ownerId === teacherId),
          listSavedCollectionIds: teacherId => [...next.collections.values()]
            .filter(item => item.ownerId === teacherId).map(item => item.id),
          putCollection: collection => {
            if (failCollectionCommit) { failCollectionCommit = false; throw new Error('synthetic commit failure'); }
            next.collections.set(collection.id, collection);
          },
          deleteCollection: id => next.collections.delete(id),
          hasAssessmentReferences: () => references,
          verifySource: () => true,
        };
        const result = await callback(tx);
        state = next;
        return structuredClone(result);
      });
      tail = work.catch(() => {});
      return work;
    },
  };
}
