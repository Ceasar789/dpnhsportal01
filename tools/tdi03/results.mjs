export function classify(suites, requirements) {
  const evidence = requirements.flatMap(([id, patterns]) => {
    const suite = suites.find(s => s.id === id);
    return patterns.map(pattern => {
      const matches = suite?.tests?.filter(t => pattern === '@suite' ? t.status === 'passed' : new RegExp(pattern).test(t.name)) || [];
      const status = suite?.status === 'FAIL' || matches.some(t => t.status === 'failed') ? 'FAIL'
        : suite?.status !== 'PASS' || !matches.length || matches.some(t => t.status !== 'passed') ? 'BLOCKED' : 'PASS';
      return { suite: id, pattern, status, tests: matches.map(t => t.name) };
    });
  });
  return { status: evidence.some(e => e.status === 'FAIL') ? 'FAIL' : !evidence.length || evidence.some(e => e.status !== 'PASS') ? 'BLOCKED' : 'PASS', evidence };
}
export function totals(tests) {
  return Object.fromEntries(['passed', 'failed', 'skipped', 'todo'].map(status => [status, tests.filter(t => t.status === status).length]));
}
export function verdict(criteria, suites) {
  return [...criteria, ...suites].some(x => x.status === 'FAIL') ? 'FAIL'
    : [...criteria, ...suites].some(x => x.status !== 'PASS') ? 'BLOCKED' : 'PASS';
}
