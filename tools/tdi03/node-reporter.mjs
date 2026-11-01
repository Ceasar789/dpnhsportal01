export default async function* report(events) {
  const tests = [];
  for await (const event of events) {
    if (['test:pass', 'test:fail'].includes(event.type) && event.data.details?.type !== 'suite') {
      tests.push({ name: event.data.name, file: event.data.file,
        status: event.data.todo ? 'todo' : event.data.skip ? 'skipped' : event.type === 'test:pass' ? 'passed' : 'failed' });
    }
  }
  yield JSON.stringify({ tests });
}
