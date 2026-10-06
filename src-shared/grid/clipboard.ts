/**
 * Tab-separated text, as spreadsheets (Excel, Google Sheets) put on the
 * clipboard: a cell holding a tab, newline or quote is quoted, with quotes
 * doubled.
 */

const quote = (cell: string) =>
  /[\t\n\r"]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;

export const toTsv = (rows: readonly (readonly string[])[]) =>
  rows.map((row) => row.map(quote).join("\t")).join("\n");

export const parseTsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char !== '"') cell += char;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else inQuotes = false;
    } else if (char === '"' && cell === "") inQuotes = true;
    else if (char === "\t") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  row.push(cell);
  rows.push(row);
  // spreadsheets end the copy with a newline: no empty last row
  const last = rows[rows.length - 1];
  if (rows.length > 1 && last.length === 1 && last[0] === "") rows.pop();
  return rows;
};
