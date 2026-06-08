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

function safeFileComponent(text) {
  return String(text || 'table').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'table';
}

function loadHelper(mftRoot) {
  const TDBHelper = require(path.join(mftRoot, 'helpers', 'TDBHelper'));
  return new TDBHelper();
}

async function readAllTables(helper) {
  const tables = helper.file.tables || [];
  for (const table of tables) {
    if (!Array.isArray(table.records) || table.records.length === 0) {
      await table.readRecords();
    }
  }
  return tables;
}

function convertFieldValue(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return value;
}

function tableToJson(table) {
  const fieldDefinitions = (table.fieldDefinitions || []).map((field) => ({
    name: field.name,
    type: field.type,
  }));
  const records = (table.records || []).map((record) => {
    const row = { _index: record.index };
    for (const [fieldName, field] of Object.entries(record.fields || {})) {
      row[fieldName] = convertFieldValue(field.value);
    }
    return row;
  });
  return {
    path: table.name,
    name: table.name,
    type: 'tdb',
    unknown1: null,
    unknown2: null,
    offset: table.offset || 0,
    raw_key_hex: '',
    declared_entries_total: records.length,
    records_parsed: records.length,
    field_definitions: fieldDefinitions,
    records,
  };
}

function writeSummary(outDir, inputPath, tables) {
  fs.mkdirSync(path.join(outDir, 'json'), { recursive: true });
  const metadata = {
    input_file: path.basename(inputPath),
    input_size_bytes: fs.statSync(inputPath).size,
    table_count: tables.length,
    warnings: [],
    tables: [],
  };
  tables.forEach((table, index) => {
    const prefix = `${String(index).padStart(3, '0')}_${safeFileComponent(table.name)}`;
    const jsonRel = path.join('json', `${prefix}.json`);
    const csvRel = path.join('csv', `${prefix}.csv`);
    const jsonPath = path.join(outDir, jsonRel);
    const tableJson = tableToJson(table);
    fs.writeFileSync(jsonPath, JSON.stringify(tableJson, null, 2));
    metadata.tables.push({
      index,
      path: table.name,
      name: table.name,
      type: 'tdb',
      unknown1: null,
      unknown2: null,
      offset: table.offset || 0,
      raw_key_hex: '',
      num_entries_declared: tableJson.records.length,
      records_parsed: tableJson.records.length,
      field_count: tableJson.field_definitions.length,
      fields: tableJson.field_definitions,
      warnings: [],
      json_file: jsonRel.replace(/\\/g, '/'),
      csv_file: csvRel.replace(/\\/g, '/'),
    });
  });
  const summaryPath = path.join(outDir, `${path.parse(inputPath).name}_summary.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(metadata, null, 2));
}

function coerceValue(type, value) {
  if (type === 0) {
    return value === null || value === undefined ? '' : String(value);
  }
  if (type === 1) {
    if (value === null || value === undefined || value === '') return '0x';
    return String(value).startsWith('0x') ? String(value) : `0x${String(value)}`;
  }
  if (type === 2 || type === 3) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Math.trunc(value);
    return Math.trunc(Number(value) || 0);
  }
  if (type === 4 || type === 13 || type === 14) {
    if (value === null || value === undefined || value === '') return 0;
    return Number(value) || 0;
  }
  return value;
}

function loadTablesByPath(parseDir) {
  const summaryName = fs.readdirSync(parseDir).find((name) => name.endsWith('_summary.json'));
  if (!summaryName) throw new Error(`No parse summary found in ${parseDir}`);
  const summary = JSON.parse(fs.readFileSync(path.join(parseDir, summaryName), 'utf8'));
  const tablesByPath = new Map();
  for (const table of summary.tables || []) {
    if (!table.path || !table.json_file) continue;
    const rel = table.json_file.replace(/\//g, path.sep);
    tablesByPath.set(table.path, JSON.parse(fs.readFileSync(path.join(parseDir, rel), 'utf8')));
  }
  return tablesByPath;
}

function applyEdits(targetTable, sourceTable) {
  const recordsByIndex = new Map((sourceTable.records || []).map((record) => [record._index, record]));
  for (const targetRecord of targetTable.records || []) {
    const sourceRecord = recordsByIndex.get(targetRecord.index);
    if (!sourceRecord) continue;
    for (const [fieldName, field] of Object.entries(targetRecord.fields || {})) {
      if (!Object.prototype.hasOwnProperty.call(sourceRecord, fieldName)) continue;
      field.value = coerceValue(field.definition.type, sourceRecord[fieldName]);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args.command;
  const mftRoot = args['mft-root'];
  const input = args.input;
  if (!command || !mftRoot || !input) {
    throw new Error('Missing required arguments');
  }

  const helper = loadHelper(mftRoot);
  await helper.load(input);
  const tables = await readAllTables(helper);

  if (command === 'summary') {
    const outDir = args['out-dir'];
    if (!outDir) throw new Error('Missing --out-dir for summary');
    writeSummary(outDir, input, tables);
    return;
  }

  if (command === 'save') {
    const parseDir = args['parse-dir'];
    const output = args.output;
    if (!parseDir || !output) throw new Error('Missing --parse-dir or --output for save');
    const tablesByPath = loadTablesByPath(parseDir);
    for (const table of tables) {
      const source = tablesByPath.get(table.name);
      if (source) applyEdits(table, source);
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    await helper.save(output);
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
