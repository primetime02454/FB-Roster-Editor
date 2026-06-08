const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    out[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

function loadSummaryTables(parseDir) {
  const summaryName = fs.readdirSync(parseDir).find((name) => name.endsWith('_summary.json'));
  if (!summaryName) throw new Error(`No parse summary found in ${parseDir}`);
  const summary = JSON.parse(fs.readFileSync(path.join(parseDir, summaryName), 'utf8'));
  const byName = new Map();
  for (const table of summary.tables || []) {
    if (!table.name || !table.json_file) continue;
    const rel = table.json_file.replace(/\//g, path.sep);
    const obj = JSON.parse(fs.readFileSync(path.join(parseDir, rel), 'utf8'));
    byName.set(table.name, obj);
  }
  return byName;
}

function defaultValue(type) {
  if (type === 0) return '';
  if (type === 1) return '0x';
  return 0;
}

function coerceValue(type, value) {
  if (type === 0) return value === null || value === undefined ? '' : String(value);
  if (type === 1) {
    if (value === null || value === undefined || value === '') return '0x';
    const text = String(value);
    return text.startsWith('0x') ? text : `0x${text}`;
  }
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Math.trunc(value);
  return Math.trunc(Number(value) || 0);
}

function sourceValueForField(sourceRecord, fieldName) {
  if (Object.prototype.hasOwnProperty.call(sourceRecord, fieldName)) return sourceRecord[fieldName];
  const lower = fieldName.toLowerCase();
  for (const [key, value] of Object.entries(sourceRecord)) {
    if (String(key).toLowerCase() === lower) return value;
  }
  return undefined;
}

function writeCurrentRecordCount(table) {
  const offset = 22;
  if (table.endian === 0) {
    table.headerBuffer.writeUInt16LE(table.header.currentRecords, offset);
  } else {
    table.headerBuffer.writeUInt16BE(table.header.currentRecords, offset);
  }
}

function replaceTable(targetTable, sourceTable) {
  const sourceRecords = sourceTable.records || [];
  const capacity = targetTable.header.maxRecords;
  if (sourceRecords.length > capacity) {
    throw new Error(`${targetTable.name} source record count ${sourceRecords.length} exceeds target capacity ${capacity}`);
  }
  const allTargetRecords = targetTable._records || [];
  for (let i = 0; i < allTargetRecords.length; i += 1) {
    const targetRecord = allTargetRecords[i];
    const sourceRecord = i < sourceRecords.length ? sourceRecords[i] : null;
    targetRecord.isPopulated = Boolean(sourceRecord);
    for (const fieldDef of targetTable.fieldDefinitions || []) {
      const field = targetRecord.fields[fieldDef.name];
      const incoming = sourceRecord ? sourceValueForField(sourceRecord, fieldDef.name) : undefined;
      field.value = coerceValue(fieldDef.type, incoming === undefined ? defaultValue(fieldDef.type) : incoming);
    }
  }
  targetTable.header.currentRecords = sourceRecords.length;
  writeCurrentRecordCount(targetTable);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mftRoot = args['mft-root'];
  const input = args.input;
  const sourceParseDir = args['source-parse-dir'];
  const output = args.output;
  if (!mftRoot || !input || !sourceParseDir || !output) {
    throw new Error('Missing required arguments');
  }

  const TDBHelper = require(path.join(mftRoot, 'helpers', 'TDBHelper'));
  const helper = new TDBHelper();
  await helper.load(input);
  const sourceTables = loadSummaryTables(sourceParseDir);
  const tableNames = ['TEAM', 'TCPS', 'PLAY', 'DCHT'];

  for (const name of tableNames) {
    const targetTable = helper.file[name];
    const sourceTable = sourceTables.get(name);
    if (!targetTable || !sourceTable) {
      throw new Error(`Missing table for import: ${name}`);
    }
    await targetTable.readRecords();
    replaceTable(targetTable, sourceTable);
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  await helper.save(output);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
