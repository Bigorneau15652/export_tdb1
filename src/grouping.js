// Pure helpers used by the table, chart and image blocks: following the active row of Grist,
// grouping rows, and reading cells that hold several lines. Nothing here touches the page.
import { aggregate } from './utils.js';

// The value of a field of the active Grist row (`id` or any column), undefined when absent.
export function activeValue(record, field) {
  if (!record || !field) return undefined;
  const fromFields = record.fields && typeof record.fields === `object` ? record.fields[field] : undefined;
  return fromFields !== undefined ? fromFields : record[field];
}

// Whether a cell (a plain value or a list of references) matches the value of the active row.
function matches(cell, wanted) {
  const text = String(wanted);
  if (Array.isArray(cell)) return cell.some((item) => String(item) === text);
  return String(cell) === text;
}

// The rows whose column holds the given value. Without a value there is nothing to show: a table
// that follows the active row must not display every row while no row is active.
export function filterByActive(records, column, wanted) {
  if (wanted === undefined || wanted === null || wanted === ``) return [];
  return records.filter((record) => matches(record.fields[column], wanted));
}

// Groups rows by the value of one column. columns lists { id, func }: the grouping column keeps
// its value, the others are summed (or averaged, ...) with their own func or defaultFunc. The
// func `count` gives the number of rows of the group. Groups keep the order of first appearance.
export function groupRecords(records, groupBy, columns, defaultFunc = `sum`) {
  const groups = new Map();
  for (const record of records) {
    const value = record.fields[groupBy];
    const key = Array.isArray(value) ? value.join(`|`) : String(value);
    if (!groups.has(key)) groups.set(key, { value, rows: [] });
    groups.get(key).rows.push(record);
  }
  const result = [];
  let index = 0;
  for (const { value, rows } of groups.values()) {
    const fields = {};
    for (const column of columns) {
      if (column.id === groupBy) {
        fields[column.id] = value;
        continue;
      }
      const func = column.func || defaultFunc;
      fields[column.id] = func === `count` ? rows.length : aggregate(rows.map((row) => row.fields[column.id]), func);
    }
    index += 1;
    result.push({ id: index, fields });
  }
  return result;
}

// The lines of a cell that may hold several (one image address or one comment per line).
export function cellLines(value) {
  if (typeof value !== `string`) return [];
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

// A Grist date (seconds since 1970, or ['d', seconds]) as DD/MM/YYYY, in UTC so that the day
// never moves with the time zone of the browser.
export function formatGristDate(value) {
  const seconds = Array.isArray(value) && value[0] === `d` ? value[1] : value;
  if (typeof seconds !== `number` || !Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(`fr-FR`, { timeZone: `UTC` }).format(date);
}
