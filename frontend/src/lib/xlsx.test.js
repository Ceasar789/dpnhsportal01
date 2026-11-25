// @vitest-environment jsdom
// U-T6: the dependency-free .xlsx writer. The tests open the file the way a
// reader does: walk the ZIP, check every part's CRC, parse the XML, read cells.
import { describe, expect, it } from 'vitest';
import { STYLE, buildXlsx, cellRef, columnName, safeSheetName, xlsxFileName } from './xlsx';
import { readCells, unzip, xml } from './xlsxTestReader';

describe('U-T6 xlsx writer', () => {
  it('column names and references', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
    expect(cellRef(0, 0)).toBe('A1');
    expect(cellRef(9, 27)).toBe('AB10');
  });

  it('a valid package: every part present, every CRC right, every XML well formed', () => {
    const files = unzip(buildXlsx({ rows: [['a']] }));
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
    for (const [name, text] of Object.entries(files)) expect(xml(text).getElementsByTagName('parsererror'), name).toHaveLength(0);
    expect(files['[Content_Types].xml']).toContain('spreadsheetml.sheet.main+xml');
  });

  it('text, numbers, empty cells and styles land in the right cells', () => {
    const bytes = buildXlsx({ rows: [[{ v: 'Name', s: STYLE.header }, 'LRN', 3], [null, '', 0.5], ['x', { v: 'P', s: STYLE.center }]] });
    const { cells } = readCells(bytes);
    expect(cells.A1).toEqual({ v: 'Name', s: STYLE.header });
    expect(cells.B1).toEqual({ v: 'LRN', s: 0 });
    expect(cells.C1).toEqual({ v: 3, s: 0 });
    expect(cells.A2).toBeUndefined();
    expect(cells.B2).toBeUndefined();
    expect(cells.C2.v).toBe(0.5);
    expect(cells.B3).toEqual({ v: 'P', s: STYLE.center });
  });

  it('escapes markup and drops characters XML cannot hold; keeps spaces and accents', () => {
    const { cells } = readCells(buildXlsx({ rows: [['<b>& "x"</b>', 'a\u0001b', '  Peña  ']] }));
    expect(cells.A1.v).toBe('<b>& "x"</b>');
    expect(cells.B1.v).toBe('ab');
    expect(cells.C1.v).toBe('  Peña  ');
  });

  it('merged cells, column widths, a frozen header and a safe sheet name', () => {
    const files = unzip(buildXlsx({ sheetName: 'Grade 8: Rizal/[A]', rows: [['t'], ['h']], merges: ['A1:D1'], widths: [5, 28], freezeRows: 2 }));
    const sheet = xml(files['xl/worksheets/sheet1.xml']);
    expect([...sheet.getElementsByTagName('mergeCell')].map(m => m.getAttribute('ref'))).toEqual(['A1:D1']);
    expect([...sheet.getElementsByTagName('col')].map(c => c.getAttribute('width'))).toEqual(['5', '28']);
    const pane = sheet.getElementsByTagName('pane')[0];
    expect([pane.getAttribute('ySplit'), pane.getAttribute('topLeftCell'), pane.getAttribute('state')]).toEqual(['2', 'A3', 'frozen']);
    expect(xml(files['xl/workbook.xml']).getElementsByTagName('sheet')[0].getAttribute('name')).toBe('Grade 8  Rizal  A');
    expect(safeSheetName('x'.repeat(40))).toHaveLength(31);
  });

  it('file names keep only safe characters and end in .xlsx', () => {
    expect(xlsxFileName('Attendance Grade 8 Rizal 2026-11-01 to 2026-11-30')).toBe('Attendance Grade 8 Rizal 2026-11-01 to 2026-11-30.xlsx');
    expect(xlsxFileName('a/b:c*?')).toBe('a b c.xlsx');
    expect(xlsxFileName('')).toBe('EduScribe.xlsx');
  });
});
