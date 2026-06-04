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

function loadTables(parseDir) {
  const summaryName = fs.readdirSync(parseDir).find((name) => name.endsWith('_summary.json'));
  if (!summaryName) {
    throw new Error(`No parse summary found in ${parseDir}`);
  }
  const summary = JSON.parse(fs.readFileSync(path.join(parseDir, summaryName), 'utf8'));
  const tableMap = new Map();
  for (const table of summary.tables || []) {
    const relPath = table.json_file || table.jsonFile;
    if (!table.path || !relPath) continue;
    const normalized = relPath.replace(/\\/g, path.sep);
    tableMap.set(table.path, JSON.parse(fs.readFileSync(path.join(parseDir, normalized), 'utf8')));
  }
  return tableMap;
}

function coerceValue(type, value) {
  if (type === 0) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Math.trunc(value);
    return Math.trunc(Number(value) || 0);
  }
  if (type === 1) {
    return value === null || value === undefined ? '' : String(value);
  }
  if (type === 10) {
    if (value === null || value === undefined || value === '') return 0;
    return Number(value) || 0;
  }
  return value;
}

function applyTableEdits(targetTable, sourceTable, pathKey, tablesByPath, parentRecordIndex = null) {
  if (!targetTable || !sourceTable || !Array.isArray(targetTable.records)) return;
  const filteredSource = (sourceTable.records || []).filter((record) => {
    if (parentRecordIndex === null) return true;
    return record._parent_record_index === parentRecordIndex;
  });
  const byIndex = new Map(filteredSource.map((record) => [record._index, record]));
  for (const targetRecord of targetTable.records) {
    const sourceRecord = byIndex.get(targetRecord.index);
    if (!sourceRecord) continue;
    for (const [fieldName, field] of Object.entries(targetRecord.fields || {})) {
      if (field.type === 4 || field.type === 5) {
        const childPath = `${pathKey}.${fieldName}`;
        const childSource = tablesByPath.get(childPath);
        if (childSource && field.value && Array.isArray(field.value.records)) {
          applyTableEdits(field.value, childSource, childPath, tablesByPath, targetRecord.index);
        }
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(sourceRecord, fieldName)) continue;
      field.value = coerceValue(field.type, sourceRecord[fieldName]);
    }
  }
}

function writeRawTdb2(TDB2Writer, file) {
  return new Promise((resolve, reject) => {
    const writer = new TDB2Writer(file);
    const buffers = [];
    writer.on('data', (buf) => buffers.push(buf));
    writer.on('end', () => resolve(Buffer.concat(buffers)));
    writer.on('error', reject);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const hc09Root = args['hc09-root'];
  const inputPath = args.input;
  const parseDir = args['parse-dir'];
  const mode = args.mode;
  const outputPath = args.output;

  if (!hc09Root || !inputPath || !parseDir || !mode || !outputPath) {
    throw new Error('Missing required arguments for HC09 save bridge');
  }

  const helperPath = path.join(hc09Root, 'madden-file-tools-master', 'helpers', 'MaddenRosterHelper');
  const writerPath = path.join(hc09Root, 'madden-file-tools-master', 'streams', 'TDB2', 'TDB2Writer');
  const MaddenRosterHelper = require(helperPath);
  const TDB2Writer = require(writerPath);

  const helper = new MaddenRosterHelper();
  await helper.load(inputPath);
  const tablesByPath = loadTables(parseDir);

  for (const targetTable of helper._file.tables || []) {
    const sourceTable = tablesByPath.get(targetTable.name);
    if (sourceTable) {
      applyTableEdits(targetTable, sourceTable, targetTable.name, tablesByPath);
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  if (mode === 'wrapped') {
    await helper.save(outputPath);
    return;
  }
  if (mode === 'raw') {
    const rawBuffer = await writeRawTdb2(TDB2Writer, helper._file);
    fs.writeFileSync(outputPath, rawBuffer);
    return;
  }
  throw new Error(`Unsupported bridge mode: ${mode}`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
