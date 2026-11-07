// Splits saved Activity text into display blocks by line shape alone, so English
// and Filipino labels parse the same way. Blocks hold plain text for text nodes.

const BULLET = /^[-•–]\s*(.+)$/;
const NUMBERED = /^\d+[.)]\s*(.+)$/;
const HEADING = /^([^:]{1,40}):$/;
const FIELD = /^([^:.]{1,40}):\s+(.+)$/;

export function parseActivityText(text) {
  if (typeof text !== 'string') return [];
  const blocks = [];
  let group = null;
  const addToGroup = (type, key, value) => {
    if (group?.type !== type) {
      group = { type, [key]: [] };
      blocks.push(group);
    }
    group[key].push(value);
  };
  const addAlone = (type, value) => {
    blocks.push({ type, text: value });
    group = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const field = line.match(FIELD);
    if (!line) group = null;
    else if (BULLET.test(line)) addToGroup('ul', 'items', line.match(BULLET)[1]);
    else if (NUMBERED.test(line)) addToGroup('ol', 'items', line.match(NUMBERED)[1]);
    else if (HEADING.test(line)) addAlone('heading', line.match(HEADING)[1]);
    else if (field && (!group || group.type === 'fields')) addToGroup('fields', 'rows', [field[1], field[2]]);
    else addAlone('p', line);
  }
  return blocks;
}
