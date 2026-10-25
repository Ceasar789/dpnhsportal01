import assert from 'node:assert/strict';

// Unexecuted. Supply this to runApprovedIntegration only after disposable
// identity and marker checks, reviewed SQL, and a synthetic fixture driver.
// Each case gets fresh Teacher/other/student JWTs and transaction-scoped rows.
export async function runWeeklyJobDatabaseCases(driver) {
  assert.equal(typeof driver?.case, 'function');
  await driver.case('owned idempotent submission and private status', async f => {
    const first = await f.submit(f.teacher, 'weekly-request-1', 30);
    const replay = await f.submit(f.teacher, 'weekly-request-1', 30);
    assert.equal(replay.id, first.id);
    assert.equal((await f.status(f.teacher, first.id)).plannedProviderCalls, 15);
    await assert.rejects(f.status(f.otherTeacher, first.id), /not_found/);
    await assert.rejects(f.status(f.student, first.id), /inactive_teacher|not_authenticated/);
    assert.equal(JSON.stringify(await f.status(f.teacher, first.id)).includes('correct_answer'), false);
  });
  await driver.case('one worker claim and expired unknown outcome', async f => {
    const job = await f.submit(f.teacher, 'weekly-request-2', 20);
    const claim = await f.claim(f.workerA, job.id);
    assert.equal(claim.batchIndex, 0);
    assert.equal(await f.claim(f.workerB, job.id), null);
    await f.expireLease(job.id);
    assert.equal(await f.claim(f.workerB, job.id), null);
    assert.equal((await f.status(f.teacher, job.id)).status, 'INTERRUPTED_UNKNOWN_OUTCOME');
    assert.equal((await f.checkpoints(job.id)).length, 0);
  });
  await driver.case('five-draft final commit is atomic and private', async f => {
    const job = await f.submit(f.teacher, 'weekly-request-3', 20);
    await f.completeInjectedBatches(job.id);
    await f.failCommitOnce(job.id);
    assert.equal((await f.collectionsFor(f.teacher)).length, 0);
    const collection = await f.commit(job.id);
    assert.equal(collection.worksheets.length, 5);
    assert.equal((await f.commit(job.id)).id, collection.id);
    await assert.rejects(f.open(f.otherTeacher, collection.id), /not_found/);
    assert.equal(JSON.stringify(await f.studentVisible(collection.id)).includes('correct_answer'), false);
    assert.deepEqual(await f.sideEffects(job.id), {
      distributions: 0, submissions: 0, scoreReleases: 0,
    });
  });
  await driver.case('same-ID revision edit and assessed archive/delete protection', async f => {
    const collection = await f.completeWeeklyCollection(f.teacher);
    const monday = collection.worksheets[0];
    const changed = await f.edit(f.teacher, collection.id, monday.id, monday.revision,
      { ...monday, title: 'Revised Monday' });
    assert.equal(changed.id, monday.id);
    await assert.rejects(f.edit(f.teacher, collection.id, monday.id, monday.revision, monday),
      /revision_conflict/);
    await f.addSyntheticSubmission(monday.id);
    await assert.rejects(f.archive(f.teacher, collection.id, monday.id), /assessed_record_protected/);
    await assert.rejects(f.delete(f.teacher, collection.id), /assessed_record_protected/);
  });
}
