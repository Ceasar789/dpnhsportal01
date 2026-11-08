#!/usr/bin/env node
// Builds the scoring-vector block of auto-score-submission.selftest.sql from
// frontend/src/lib/scoringVectors.json, so the SQL scorer is checked against
// exactly the cases the JS scorer is tested with.
//
//   node backend/database/scripts/genScoringVectors.cjs          print the block
//   node backend/database/scripts/genScoringVectors.cjs --write  rewrite it in the selftest
//
// frontend/src/lib/scoringVectors.sqlSync.test.js fails when the two differ.
const fs = require('fs');
const path = require('path');

const VECTORS = path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'lib', 'scoringVectors.json');
const SELFTEST = path.join(__dirname, '..', 'migrations', 'auto-score-submission.selftest.sql');
const BEGIN = '-- BEGIN GENERATED VECTORS';
const END = '-- END GENERATED VECTORS';

function buildBlock(vectors = JSON.parse(fs.readFileSync(VECTORS, 'utf8'))) {
  const json = JSON.stringify(vectors);
  if (json.includes('$vectors$')) throw new Error('A vector contains the SQL quote tag $vectors$.');
  const lines = vectors.map((vector, index) => `${JSON.stringify(vector)}${index < vectors.length - 1 ? ',' : ''}`);
  return [BEGIN, '  v_vectors := $vectors$[', ...lines, ']$vectors$::jsonb;', END].join('\n');
}

function currentBlock(sql) {
  const text = sql.replace(/\r\n/g, '\n');
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start < 0 || end < start) return null;
  return text.slice(start, end + END.length);
}

function writeBlock() {
  const sql = fs.readFileSync(SELFTEST, 'utf8').replace(/\r\n/g, '\n');
  const block = currentBlock(sql);
  if (block === null) throw new Error(`Markers not found in ${SELFTEST}`);
  fs.writeFileSync(SELFTEST, sql.replace(block, () => buildBlock()));
}

if (require.main === module) {
  if (process.argv.includes('--write')) writeBlock();
  else process.stdout.write(`${buildBlock()}\n`);
}

module.exports = { buildBlock, currentBlock, SELFTEST };
