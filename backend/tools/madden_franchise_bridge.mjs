import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const franchiseRoot =
  process.env.MADDEN_FRANCHISE_ROOT ||
  String.raw`C:\Users\Shadow\Downloads\madden-franchise-master`;

const franchiseModuleUrl = pathToFileURL(path.join(franchiseRoot, 'src', 'index.js')).href;
const { default: FranchiseFile } = await import(franchiseModuleUrl);

const command = process.argv[2];

function pickCfb27DynastyFilesRoot() {
  const candidates = [
    process.env.CFB27_DYNASTY_FILES_ROOT,
    path.resolve(franchiseRoot, '..', '..', '..', '..', '..', 'CFB27', 'Dynasty_Files'),
    path.resolve(franchiseRoot, '..', '..', '..', 'CFB27', 'Dynasty_Files'),
    String.raw`C:\Users\Shadow\Desktop\CFB27\Dynasty_Files`
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'franchise-schemas.FTX'))) {
      return candidate;
    }
  }
  return candidates[candidates.length - 1];
}

const cfb27DynastyFilesRoot = pickCfb27DynastyFilesRoot();

function normalizeSchemaKey(value) {
  return String(value || '')
    .replace(/\.(ftx|xml)$/i, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .toLowerCase();
}

function addSchemaMapEntry(fileMap, key, filePath) {
  const raw = String(key || '').replace(/\.(ftx|xml)$/i, '');
  if (!raw) return;
  fileMap[raw] = filePath;
  fileMap[raw.toLowerCase()] = filePath;
  fileMap[raw.replace(/\//g, '\\')] = filePath;
  fileMap[raw.replace(/\\/g, '/')] = filePath;
  fileMap[normalizeSchemaKey(raw)] = filePath;
  const base = path.basename(raw);
  fileMap[base] = filePath;
  fileMap[base.toLowerCase()] = filePath;
}

function walkSchemaFiles(rootDir) {
  const out = [];
  if (!rootDir || !fs.existsSync(rootDir)) return out;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkSchemaFiles(entryPath));
    } else if (/\.(ftx|xml)$/i.test(entry.name)) {
      out.push(entryPath);
    }
  }
  return out;
}

function buildCfb27SchemaFileMap(rootDir, mainPath) {
  const fileMap = { main: mainPath };
  for (const filePath of walkSchemaFiles(rootDir)) {
    const rel = path.relative(rootDir, filePath);
    addSchemaMapEntry(fileMap, rel, filePath);
    addSchemaMapEntry(fileMap, path.basename(filePath), filePath);
  }
  return fileMap;
}

function shouldUseCfb27Schemas(inputPath) {
  const lower = path.basename(inputPath || '').toLowerCase();
  return (
    process.env.FORCE_CFB27_SCHEMAS === '1' ||
    lower.includes('dynasty') ||
    lower.endsWith('.ftc') ||
    lower.endsWith('.ftb')
  );
}

function buildOpenSettings(inputPath) {
  const mainPath = path.join(cfb27DynastyFilesRoot, 'franchise-schemas.FTX');
  if (!shouldUseCfb27Schemas(inputPath) || !fs.existsSync(mainPath)) {
    return undefined;
  }
  return {
    schemaOverride: {
      gameYear: 27,
      major: 441,
      minor: 0,
      path: mainPath
    },
    gameYearOverride: 27,
    useNewSchemaGeneration: true,
    schemaFileMap: buildCfb27SchemaFileMap(cfb27DynastyFilesRoot, mainPath)
  };
}

async function openFranchiseFile(inputPath) {
  return FranchiseFile.create(inputPath, buildOpenSettings(inputPath));
}

const NFL_TEAM_INDEX_TO_CGID = {
  0: 0,
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  7: 0,
  8: 0,
  9: 0,
  11: 0,
  16: 0,
  17: 0,
  21: 0,
  22: 0,
  24: 0,
  28: 0,
  29: 0,
  31: 0,
  5: 1,
  6: 1,
  10: 1,
  12: 1,
  13: 1,
  14: 1,
  15: 1,
  18: 1,
  19: 1,
  20: 1,
  23: 1,
  25: 1,
  26: 1,
  27: 1,
  30: 1
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function safeJson(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return Number(value);
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (Array.isArray(value)) return value.map((entry) => safeJson(entry));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('tableId' in value && 'rowNumber' in value) {
      return {
        tableId: value.tableId ?? null,
        rowNumber: value.rowNumber ?? null
      };
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeSegment(value) {
  return String(value || 'TABLE').replace(/[^A-Za-z0-9_-]+/g, '_');
}

function pickPrimaryTeamTable(franchise) {
  const teamTables = franchise.getAllTablesByName('Team') || [];
  if (!teamTables.length) return null;
  return [...teamTables].sort((a, b) => (b.header?.recordCapacity ?? 0) - (a.header?.recordCapacity ?? 0))[0];
}

function tableAliasFor(table, primaryTeamUniqueId) {
  const actualName = String(table.header?.name || table.name || 'TABLE');
  const uniqueId = table.header?.uniqueId ?? table.header?.tablePad1 ?? table.index;
  if (actualName === 'Player') {
    return { name: 'PLAY', path: 'FRANCHISE.PLAY' };
  }
  if (actualName === 'CharacterVisuals') {
    return { name: 'CHVI', path: 'FRANCHISE.CHVI' };
  }
  if (actualName === 'Team' && uniqueId === primaryTeamUniqueId) {
    return { name: 'TEAM', path: 'FRANCHISE.TEAM' };
  }
  if (actualName === 'Team') {
    return {
      name: `TEAM_${uniqueId}`,
      path: `FRANCHISE.${sanitizeSegment(actualName)}.${uniqueId}`
    };
  }
  const upper = actualName.toUpperCase();
  return {
    name: upper,
    path: `FRANCHISE.${sanitizeSegment(actualName)}.${uniqueId}`
  };
}

function franchiseLogoId(record) {
  const assetName = String(record.AssetName || '');
  if (assetName === 'AFCProBowl') return 34;
  if (assetName === 'NFCProBowl') return 33;
  if (record.TeamIndex === 32 && assetName === 'FreeAgents') return 32;
  if (record.TeamIndex !== null && record.TeamIndex !== undefined && Number.isFinite(Number(record.TeamIndex))) {
    return Number(record.TeamIndex);
  }
  return null;
}

function franchiseConferenceId(record) {
  const assetName = String(record.AssetName || '');
  if (assetName === 'FreeAgents' || assetName === 'Practice') return null;
  if (assetName === 'AFCProBowl') return 0;
  if (assetName === 'NFCProBowl') return 1;
  const teamIndex = Number(record.TeamIndex);
  if (Number.isFinite(teamIndex) && Object.prototype.hasOwnProperty.call(NFL_TEAM_INDEX_TO_CGID, teamIndex)) {
    return NFL_TEAM_INDEX_TO_CGID[teamIndex];
  }
  return null;
}

function addLegacyAliases(tableName, record, rowIndex) {
  if (tableName === 'TEAM') {
    const displayName = record.DisplayName ?? null;
    const longName = record.LongName === displayName ? null : (record.LongName ?? null);
    const logoId = franchiseLogoId(record);
    const cgid = franchiseConferenceId(record);
    record.TDNA = displayName;
    record.TDLN = longName;
    record.TMNC = displayName;
    record.TDAN = record.AssetName ?? displayName;
    record.TABB = record.ShortName ?? null;
    record.TGID = record.TeamIndex ?? rowIndex;
    record.TROV = record.TEAM_RATINGOVR ?? null;
    record.TROF = record.TEAM_RATINGOFF ?? null;
    record.TRDE = record.TEAM_RATINGDEF ?? null;
    record.CGID = cgid;
    record.TLGO = logoId;
    record.TBCR = record.TEAM_BACKGROUNDCOLORR ?? record.HubBackgroundColorR ?? null;
    record.TBCG = record.TEAM_BACKGROUNDCOLORG ?? record.HubBackgroundColorG ?? null;
    record.TBCB = record.TEAM_BACKGROUNDCOLORB ?? record.HubBackgroundColorB ?? null;
    record.TB2R = record.TEAM_BACKGROUNDCOLORR2 ?? record.TEAM_LOGO_SECONDARYR ?? null;
    record.TB2G = record.TEAM_BACKGROUNDCOLORG2 ?? record.TEAM_LOGO_SECONDARYG ?? null;
    record.TB2B = record.TEAM_BACKGROUNDCOLORB2 ?? record.TEAM_LOGO_SECONDARYB ?? null;
  }
  if (tableName === 'PLAY') {
    record.PFID = rowIndex;
    record.PGID = rowIndex;
    record.PFNA = record.FirstName ?? null;
    record.PLNA = record.LastName ?? null;
    record.POVR = record.OverallRating ?? null;
    record.PPOS = record.Position ?? null;
    record.JNUM = record.JerseyNum ?? null;
    record.TGID = record.TeamIndex ?? null;
  }
}

async function exportTableToJson(franchise, tableMeta, outputPath) {
  const table = franchise.getTableByUniqueId(tableMeta.unique_id);
  if (!table) fail(`Table not found: ${tableMeta.path}`);
  await table.readRecords();
  const fieldDefinitions = (table.offsetTable || []).map((field) => ({
    name: field.name,
    type: field.type,
    isReference: !!field.isReference
  }));
  const records = table.records.map((sourceRecord, rowIndex) => {
    const record = {
      _index: rowIndex
    };
    if (sourceRecord.isEmpty) {
      record._isEmpty = true;
    }
    for (const field of table.offsetTable || []) {
      record[field.name] = safeJson(sourceRecord[field.name]);
    }
    addLegacyAliases(tableMeta.name, record, rowIndex);
    return record;
  });
  const payload = {
    name: tableMeta.name,
    actual_name: tableMeta.actual_name,
    path: tableMeta.path,
    unique_id: tableMeta.unique_id,
    table_id: tableMeta.table_id,
    field_definitions: fieldDefinitions,
    records
  };
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
}

async function doSummary(inputPath, outDir, inputStem) {
  const franchise = await openFranchiseFile(inputPath);
  const primaryTeamTable = pickPrimaryTeamTable(franchise);
  const primaryTeamUniqueId = primaryTeamTable?.header?.uniqueId ?? null;
  const tables = franchise.tables.map((table) => {
    const alias = tableAliasFor(table, primaryTeamUniqueId);
    const actualName = String(table.header?.name || table.name || 'TABLE');
    const uniqueId = table.header?.uniqueId ?? table.index;
    const jsonFile = `${sanitizeSegment(alias.path)}.json`;
    return {
      path: alias.path,
      name: alias.name,
      actual_name: actualName,
      unique_id: uniqueId,
      table_id: table.header?.tableId ?? null,
      field_count: Array.isArray(table.schema?.attributes) ? table.schema.attributes.length : 0,
      record_capacity: table.header?.recordCapacity ?? 0,
      records_parsed: table.header?.recordCapacity ?? 0,
      json_file: jsonFile,
      csv_file: `${sanitizeSegment(alias.path)}.csv`
    };
  });
  const summary = {
    parser: 'madden-franchise',
    game_year: franchise.gameYear,
    file_type: franchise.type,
    table_count: tables.length,
    warnings: [],
    tables
  };
  ensureDir(outDir);
  fs.writeFileSync(path.join(outDir, `${inputStem}_summary.json`), JSON.stringify(summary, null, 2), 'utf8');
}

async function doExportTable(inputPath, tableMetaPath, outputPath) {
  const tableMeta = JSON.parse(fs.readFileSync(tableMetaPath, 'utf8'));
  const franchise = await openFranchiseFile(inputPath);
  await exportTableToJson(franchise, tableMeta, outputPath);
}

try {
  if (command === 'summary') {
    const [, , , inputPath, outDir, inputStem] = process.argv;
    if (!inputPath || !outDir || !inputStem) fail('Usage: summary <inputPath> <outDir> <inputStem>');
    await doSummary(inputPath, outDir, inputStem);
    process.exit(0);
  }
  if (command === 'export-table') {
    const [, , , inputPath, tableMetaPath, outputPath] = process.argv;
    if (!inputPath || !tableMetaPath || !outputPath) fail('Usage: export-table <inputPath> <tableMetaPath> <outputPath>');
    await doExportTable(inputPath, tableMetaPath, outputPath);
    process.exit(0);
  }
  fail(`Unknown command: ${command}`);
} catch (error) {
  fail(error?.stack || error?.message || String(error));
}
