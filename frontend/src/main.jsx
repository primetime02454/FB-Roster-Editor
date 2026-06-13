import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const CLOUD_RUN_API_BASE = 'https://madden-roster-editor-api-13516500762.us-central1.run.app/api';
const API = import.meta.env.VITE_API_URL || defaultApiBase();
const PAGE_SIZE = 100;
const VISUALS_PAGE_SIZE = 75;
const TABLE_CACHE_LIMIT = 18;
const TABLE_ROW_HEIGHT = 32;
const TABLE_OVERSCAN = 10;
const NAV_ROW_HEIGHT = 55;
const NAV_OVERSCAN = 8;
const EDITOR_META_CACHE = new Map();
const VISUAL_OPTIONS_CACHE = new Map();
const PLAYER_VISUALS_CACHE = new Map();
const PLAYER_INFO_ORDER = [
  'PFNA', 'PLNA', 'PGID', 'POID', 'TGID', 'PPOS', 'PLTY', 'POVR',
  'PAGE', 'PHGT', 'PWGT', 'PYEA', 'PYRP', 'PRSD', 'PJEN', 'PCOL', 'PHTN', 'PHSN',
  'PHAN', 'PCPH', 'PINJ', 'PYCF', 'PSXP', 'PGHE', 'PCMT',
];
const PLAYER_CONTRACT_ORDER = [
  'PCON', 'PCYL', 'PCSA', 'PTSA', 'PVCO', 'PVSB', 'PVTS', 'PSBO',
  'PSA0', 'PSA1', 'PSA2', 'PSA3', 'PSA4', 'PSA5', 'PSA6',
  'PSB0', 'PSB1', 'PSB2', 'PSB3', 'PSB4', 'PSB5', 'PSB6',
];
const PLAYER_MISC_ORDER = [
  'PFPB', 'PFHO', 'ISCN', 'PSTM', 'PSTN', 'PQBS', 'PSTY',
  'EPAV', 'PEPS', 'PEYE', 'PBRE', 'PFMK', 'PHCL', 'PHLM',
];
const TEAM_INFO_ORDER = [
  'TDNA', 'TLNA', 'TMNC', 'TMAN', 'TGID', 'TMID', 'TCID', 'CYID', 'TORD',
  'TCIN', 'TCNA', 'TDPB', 'TOPB', 'TCRP', 'TCRD', 'TMSO', 'TMST',
  'TMHO', 'TMHT', 'TOID', 'SGID', 'TRV1', 'TRV2', 'TRV3', 'TSNA', 'TTYP', 'TVIS', 'TREP',
];
const TEAM_RATING_ORDER = [
  'TOQB', 'TORB', 'TOWR', 'TOOL', 'TODL', 'TOLB', 'TODB', 'TOOF', 'TODF', 'TOSP',
  'TRQB', 'TRRB', 'TWRR', 'TROL', 'TRDL', 'TRLB', 'TRDB', 'TROF', 'TRDE', 'TRST', 'TROV',
];
const POSITION_OPTIONS = [
  { id: 0, label: 'QB' },
  { id: 1, label: 'RB' },
  { id: 2, label: 'FB' },
  { id: 3, label: 'WR' },
  { id: 4, label: 'TE' },
  { id: 5, label: 'LT' },
  { id: 6, label: 'LG' },
  { id: 7, label: 'C' },
  { id: 8, label: 'RG' },
  { id: 9, label: 'RT' },
  { id: 10, label: 'LE' },
  { id: 11, label: 'RE' },
  { id: 12, label: 'DT' },
  { id: 13, label: 'SAM' },
  { id: 14, label: 'MLB' },
  { id: 15, label: 'WILL' },
  { id: 16, label: 'CB' },
  { id: 17, label: 'FS' },
  { id: 18, label: 'SS' },
  { id: 19, label: 'K' },
  { id: 20, label: 'P' },
];
const PLAYER_POSITION_LABELS = Object.fromEntries(POSITION_OPTIONS.map(option => [String(option.id), option.label])); //Added by Primetime02454 6-13-26 (temporary archetype fix)
const MADDEN27_ARCHETYPE_OPTIONS = [
  'Field General', 'Strong Arm', 'Improviser', 'Scrambler', 'Elusive Back', 'Power Back',
  'Elusive Back', 'Receiving Back', 'Receiving Back', 'Power Back', 'Elusive Back',
  'Elusive Back', 'Blocking', 'Utility', 'Deep Threat', 'Playmaker', 'Receiving Back',
  'Power Back', 'Elusive Back', 'Elusive Back', 'Physical', 'Slot', 'Blocking',
  'Vertical Threat', 'Receiving Back', 'Power Back', 'Possession', 'Pass Protector',
  'Power', 'Elusive Back', 'Agile', 'Pass Protector', 'Power', 'Elusive Back',
  'Agile', 'Pass Protector', 'Elusive Back', 'Power', 'Agile', 'Speed Rusher',
  'Power Rusher', 'Receiving Back', 'Run Stopper', 'Nose Tackle', 'Power Back',
  'Speed Rusher', 'Power Rusher', 'Speed Rusher', 'Power Rusher', 'Pass Coverage',
  'Run Stopper', 'Field General', 'Pass Coverage', 'Run Stopper', 'Man To Man',
  'Slot', 'Zone', 'Elusive Back', 'Zone', 'Hybrid', 'Run Support', 'Accurate',
  'Power', 'Balanced', 'Balanced', 'Power', 'Accurate', 'Gadget', '?',
].map((label, value) => ({ label: `${value} - ${label}`, value: String(value) }));
const PLAYER_INFO_SECTIONS = [
  { key: 'player-core', title: 'Player Data', columns: ['PFNA', 'PLNA', 'PGID', 'POID', 'TGID', 'PPOS', 'PLTY', 'POVR', 'PJEN'] },
  { key: 'player-bio', title: 'Bio / Status', columns: ['PAGE', 'PHGT', 'PWGT', 'PYEA', 'PYRP', 'PRSD', 'PCOL', 'PHTN', 'PHSN', 'PHAN', 'PCPH', 'PINJ', 'PYCF', 'PSXP', 'PGHE', 'PCMT'] },
];

const PLAYER_SECTION_DEFS = [
  { key: 'identity', title: 'Player Information', codes: PLAYER_INFO_ORDER },
  { key: 'ratings', title: 'Player Ratings', matcher: code => (code.startsWith('P') || code.startsWith('T') || code.startsWith('S')) && !PLAYER_CONTRACT_ORDER.includes(code) && !PLAYER_MISC_ORDER.includes(code) && !PLAYER_INFO_ORDER.includes(code) },
  { key: 'misc', title: 'Traits / Misc', codes: PLAYER_MISC_ORDER },
  { key: 'contract', title: 'Contract', codes: PLAYER_CONTRACT_ORDER },
];

const TEAM_SECTION_DEFS = [
  { key: 'identity', title: 'Team Information', codes: TEAM_INFO_ORDER },
  { key: 'ratings', title: 'Team Ratings', codes: TEAM_RATING_ORDER },
  { key: 'misc', title: 'Other Team Data', matcher: () => true },
];
const PLAYER_EDITOR_TABS = [
  { key: 'info', label: 'Player Information' },
  { key: 'ratings', label: 'Player Ratings' },
  { key: 'visuals', label: 'Appear/Equip/Misc' },
  { key: 'contract', label: 'Contract' },
];
const TEAM_EDITOR_TABS = [
  { key: 'info', label: 'Team Information' },
  { key: 'ratings', label: 'Team Ratings' },
  { key: 'misc', label: 'Other' },
];
const PLAYER_RATING_COLUMNS = new Set([
  'POVR', 'PAGE', 'PHGT', 'PWGT', 'PYRP', 'PJEN', 'PHAN', 'PYCF', 'PSXP',
  'PACC', 'PAGI', 'PAWR', 'PBCV', 'PBKT', 'PBSG', 'PBSK', 'PCAR', 'PCBT',
  'PCMT', 'PCTH', 'PDRO', 'PDRR', 'PELU', 'PFMS', 'PICN', 'PIMP', 'PINJ',
  'PJEN', 'PJMP', 'PKAC', 'PKPR', 'PKRT', 'PLBK', 'PLBD', 'PMCV', 'PPBK',
  'PPLY', 'PPMC', 'PPRE', 'PRBK', 'PRLS', 'PRUN', 'PSAC', 'PSFA', 'PSFM',
  'PSHK', 'PSHP', 'PSPD', 'PSTA', 'PSTR', 'PTAK', 'PTHA', 'PTHP', 'PTOR',
  'PTUP', 'PWGT', 'PZCV', 'PIMP'      //added PIMP - primetime02454 6-12-26
]);
const TEAM_COLOR_FIELDS = [
  { key: 'TBCR', label: 'Primary R' },
  { key: 'TBCG', label: 'Primary G' },
  { key: 'TBCB', label: 'Primary B' },
  { key: 'TB2R', label: 'Secondary R' },
  { key: 'TB2G', label: 'Secondary G' },
  { key: 'TB2B', label: 'Secondary B' },
];
const TEAM_BRANDING_NAME_COLUMNS = ['TSNA', 'TMSO', 'TMST', 'TMHO', 'TMHT'].filter(Boolean);
const TEAM_RIVAL_COLUMNS = ['TRV1', 'TRV2', 'TRV3'];
const TEAM_COLOR_FIELD_KEYS = TEAM_COLOR_FIELDS.map(field => field.key);
const TEAM_INFO_EXTRA_COLUMNS = [...TEAM_BRANDING_NAME_COLUMNS, ...TEAM_RIVAL_COLUMNS, ...TEAM_COLOR_FIELD_KEYS, 'TCRK', 'TMRK'];
const TEAM_HEADER_STAT_CODES = ['TROV', 'TROF', 'TRDE', 'TCRK', 'TMRK'];
const CONFERENCE_LOGOS_BY_CGID = {
  0: { display: 'ACC', file: 'acc.svg', nflFile: 'AFC.png' },
  1: { display: 'Big Ten', file: 'big-ten.svg', nflFile: 'NFC.png' },
  2: { display: 'Big 12', file: 'big-12.svg' },
  3: { display: 'American', file: 'american.svg' },
  4: { display: 'C-USA', file: 'c-usa.svg' },
  5: { display: 'Independent', file: 'independent.svg' },
  6: { display: 'MAC', file: 'mac.svg' },
  7: { display: 'Mountain West', file: 'mountain-west.svg' },
  8: { display: 'Pac 12', file: 'pac-12.svg' },
  9: { display: 'SEC', file: 'sec.svg', nflFile: null },
  10: { display: 'Sun Belt', file: 'sun-belt.svg' },
};
const MADDEN_CONFERENCE_LOGOS_BY_CGID = {
  0: { display: 'AFC', file: 'AFC.png' },
  1: { display: 'NFC', file: 'NFC.png' },
};
const CONFERENCE_LOGO_ASSET_VERSION = '20260606-1128';
const NFL_TEAM_LOGO_FALLBACKS = {
  bears: '0',
  bengals: '1',
  bills: '2',
  broncos: '3',
  browns: '4',
  buccaneers: '5',
  cardinals: '6',
  chargers: '7',
  chiefs: '8',
  colts: '9',
  cowboys: '10',
  dolphins: '11',
  eagles: '12',
  falcons: '13',
  '49ers': '14',
  giants: '15',
  jaguars: '16',
  jets: '17',
  lions: '18',
  packers: '19',
  panthers: '20',
  patriots: '21',
  raiders: '22',
  rams: '23',
  ravens: '24',
  saints: '25',
  seahawks: '26',
  steelers: '27',
  texans: '28',
  titans: '29',
  vikings: '30',
  'free agents': 'NFL',
  freeagents: 'NFL',
};
const HIDDEN_TABLE_COLUMNS = new Set(['__rowIndex', '_parent_table_path', '_parent_table_name', '_parent_record_index', '_index']);
const TABLE_NAME_SUFFIXES = {
  TCPS: 'Team Rankings',
};
const VIEW_BUTTONS = [
  { key: 'table', label: 'Table View' },
  { key: 'player', label: 'Player Editor' },
  { key: 'team', label: 'Team Editor' },
  { key: 'visuals', label: 'Character Visuals' },
];
const VISUALS_LABELS = {
  'Player ID': 'Player ID',
  'First Name': 'First Name',
  'Last Name': 'Last Name',
  'Jersey Number': 'Jersey Number',
  'Asset Name': 'Asset Name',
};
const EDITOR_MODE_LABELS = {
  table: 'Table View',
  player: 'Player Editor',
  team: 'Team Editor',
  visuals: 'Character Visuals',
  node: 'Node JSON',
};

function defaultApiBase() {
  const host = window.location.hostname;
  const port = window.location.port;
  if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) {
    return CLOUD_RUN_API_BASE;
  }
  if ((host === '127.0.0.1' || host === 'localhost') && port === '5173') {
    return 'http://127.0.0.1:8000/api';
  }
  if ((host === '127.0.0.1' || host === 'localhost') && port === '5000') {
    return 'http://127.0.0.1:8000/api';
  }
  return `${window.location.origin}/api`;
}

function initialSessionIdFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('session') || '';
  } catch {
    return '';
  }
}

function isVisibleTableColumn(column) {
  return column && !HIDDEN_TABLE_COLUMNS.has(column) && !column.startsWith('_parent_');
}

function tableDisplayName(table) {
  const name = table?.name || '';
  const suffix = TABLE_NAME_SUFFIXES[name?.toUpperCase?.()];
  return suffix ? `${name} (${suffix})` : name;
}

function tableTitle(path, table) {
  if (!path) return 'No table selected';
  const name = table?.name || path.split('.').pop();
  const suffix = TABLE_NAME_SUFFIXES[name?.toUpperCase?.()];
  return suffix ? `${path} (${suffix})` : path;
}

function clearSessionIdFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('session')) return;
    url.searchParams.delete('session');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {}
}

function isSessionMissingError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return err?.status === 404 || msg.includes('session not found') || msg === 'not found';
}

function rememberLimited(cache, key, value, limit = TABLE_CACHE_LIMIT) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    cache.delete(cache.keys().next().value);
  }
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function apiUrl(path) {
  return `${API}${path}`;
}

function shouldTryCloudFallback(err) {
  if (!(API.includes('127.0.0.1:8000') || API.includes('localhost:8000'))) return false;
  const message = String(err?.message || '').toLowerCase();
  return message.includes('failed to fetch') || message.includes('networkerror') || message.includes('load failed');
}

async function fetchWithFallback(path, options = {}) {
  const primaryUrl = apiUrl(path);
  try {
    return await fetch(primaryUrl, options);
  } catch (err) {
    if (!shouldTryCloudFallback(err)) throw err;
    return fetch(`${CLOUD_RUN_API_BASE}${path}`, options);
  }
}

async function fetchJson(path, options = {}) {
  const res = await fetchWithFallback(path, options);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      message = body.detail || message;
    } catch {}
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

async function downloadFile(path, fallbackName = 'download.bin') {
  const { blob, filename } = await fetchDownloadBlob(path, fallbackName);
  downloadBlob(blob, filename);
  return { filename };
}

function downloadBlob(blob, filename = 'download.bin') {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function fetchDownloadBlob(path, fallbackName = 'download.bin') {
  const res = await fetchWithFallback(path);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      message = body.detail || message;
    } catch {}
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return { blob, filename: match?.[1] || fallbackName };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Could not read file data.'));
    reader.readAsDataURL(blob);
  });
}

// Running inside the pywebview desktop window? The WebView2 host does not
// support browser blob downloads or the File System Access API picker, so
// saves must go through the native Python bridge instead.
function isDesktopApp() {
  return typeof window !== 'undefined' && !!window.pywebview;
}

function getDesktopSaveApi() {
  const api = (typeof window !== 'undefined' && window.pywebview && window.pywebview.api) || null;
  if (!api) return null;
  if (typeof api.save_download === 'function' || typeof api.save_file_as === 'function') return api;
  return null;
}

// pywebview injects window.pywebview.api shortly after load; poll briefly so an
// early click does not fall through to a non-functional browser code path.
async function waitForDesktopSaveApi(timeoutMs = 4000) {
  if (!isDesktopApp()) return null;
  const ready = getDesktopSaveApi();
  if (ready) return ready;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const api = getDesktopSaveApi();
    if (api) return api;
  }
  return getDesktopSaveApi();
}

// Save a server file to disk through the native desktop dialog. Prefers
// save_download (Python fetches the bytes itself) and falls back to streaming
// the blob through the bridge as base64 for older desktop builds.
async function nativeSaveFromServer(api, path, fallbackName) {
  if (typeof api.save_download === 'function') {
    return api.save_download(apiUrl(path), fallbackName);
  }
  const { blob, filename } = await fetchDownloadBlob(path, fallbackName);
  const base64 = await blobToBase64(blob);
  return api.save_file_as(filename || fallbackName, base64);
}

function valueText(value) {
  if (value === null || value === undefined || value === '') return '0';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parsePossibleJson(text) {
  const t = String(text ?? '').trim();
  if (!t) return '';
  if (t.toLowerCase() === 'true') return true;
  if (t.toLowerCase() === 'false') return false;
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try { return JSON.parse(t); } catch {}
  }
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d+\.\d+$/.test(t)) return Number(t);
  return text;
}

function labelForField(meta, code) {
  const customLabels = {
    TROV: 'Overall Rating',
    TROF: 'Offensive Rating',
    TRDE: 'Defensive Rating',
    TCRK: 'Coaches Ranking',
    TMRK: 'Media Ranking',
  };
  return customLabels[code] || meta?.labels?.[code] || code;
}

function displayLabel(code, labels = {}) {
  return labels?.[code] || code;
}

function isNumericValue(value) {
  return /^-?\d+(\.\d+)?$/.test(String(value ?? '').trim());
}

function clampColorByte(value) {
  return Math.max(0, Math.min(255, Number(value) || 0));
}

function colorStyleFromRecord(record, keys, fallback = '#1c1f24') {
  const [rKey, gKey, bKey] = keys;
  if (!record) return fallback;
  const r = clampColorByte(record[rKey]);
  const g = clampColorByte(record[gKey]);
  const b = clampColorByte(record[bKey]);
  return `rgb(${r}, ${g}, ${b})`;
}

function colorHexFromValues(r, g, b) {
  const hex = value => clampColorByte(value).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function cleanPortraitName(value) {
  return String(value || '')
    .trim()
    .replace(/^nilpp_/i, '')
    .replace(/\.png$/i, '');
}

function apiAssetBase() {
  return API.replace(/\/api\/?$/, '');
}

function playerPortraitUrl(name, playerId) {
  const cleaned = cleanPortraitName(name);
  if (!cleaned) return '';
  const encoded = encodeURIComponent(cleaned);
  const cacheBust = playerId ? `?pgid=${encodeURIComponent(playerId)}` : '';
  return `${apiAssetBase()}/api/portraits/nilpp_${encoded}.png${cacheBust}`;
}

function makeUniquePortraitName(value) {
  const cleaned = cleanPortraitName(value);
  if (!cleaned) return '';
  return /^Unique_/i.test(cleaned) ? cleaned : `Unique_${cleaned}`;
}

function compactNamePart(value) {
  return String(value || '').trim().replace(/[^A-Za-z0-9]/g, '');
}

function hasExactPortraitSuffix(value) {
  return /_[0-9]+$/i.test(cleanPortraitName(value));
}

function playerPortraitCandidates({
  genericHeadName,
  assetName,
  playerId,
  firstName,
  lastName,
  portraitId,
} = {}) {
  const compactLast = compactNamePart(lastName);
  const compactFirst = compactNamePart(firstName);
  const compactPlayerId = compactNamePart(playerId);
  const cleanedGenericHead = cleanPortraitName(genericHeadName);
  const cleanedAssetName = cleanPortraitName(assetName);
  const exactNames = [
    cleanedGenericHead,
    cleanedAssetName,
    makeUniquePortraitName(cleanedAssetName),
  ].filter(Boolean);
  const fallbackNames = [];

  if (cleanedGenericHead && !hasExactPortraitSuffix(cleanedGenericHead) && !/^\d+$/.test(cleanedGenericHead)) {
    fallbackNames.push(makeUniquePortraitName(cleanedGenericHead));
  }

  if (compactLast && compactFirst && compactPlayerId) {
    fallbackNames.push(`Unique_${compactLast}${compactFirst}_${compactPlayerId}`);
  }
  if (compactLast && compactFirst && portraitId) {
    fallbackNames.push(`Unique_${compactLast}${compactFirst}_${compactNamePart(portraitId)}`);
  }
  const names = [...exactNames, ...fallbackNames, 'Blank'];

  const seen = new Set();
  return names
    .map(cleanPortraitName)
    .filter(Boolean)
    .filter(name => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(name => playerPortraitUrl(name, playerId));
}

function colorFromOption(option, fallback = '#181a1e') {
  const color = option?.primaryColor;
  if (!color) return fallback;
  return `rgb(${clampColorByte(color.r)}, ${clampColorByte(color.g)}, ${clampColorByte(color.b)})`;
}

function colorOverlayFromOption(option, fallback = 'rgba(24, 26, 30, .82)') {
  const color = option?.primaryColor;
  if (!color) return fallback;
  return `rgba(${clampColorByte(color.r)}, ${clampColorByte(color.g)}, ${clampColorByte(color.b)}, .76)`;
}

function texturedTeamBackground(option, fallback = 'rgba(24, 26, 30, .82)') {
  const overlay = colorOverlayFromOption(option, fallback);
  return `linear-gradient(${overlay}, ${overlay}), url("/CFB27_Background.png") center / cover no-repeat`;
}

function teamLogoUrl(rowIndex) {
  if (rowIndex === undefined || rowIndex === null || rowIndex === '') return '';
  return `/team-logos/${rowIndex}.png`;
}

const COLLEGE_TEAM_LOGO_NAMES = [
  'Air Force', 'Akron', 'Alabama', 'Appalachian State', 'Arizona', 'Arizona State', 'Arkansas', 'Arkansas State',
  'Army', 'Auburn', 'Ball State', 'Baylor', 'Boise State', 'Boston College', 'Bowling Green', 'Buffalo', 'BYU',
  'California', 'Central Michigan', 'Charlotte', 'Cincinnati', 'Clemson', 'Coastal Carolina', 'Colorado',
  'Colorado State', 'Duke', 'East Carolina', 'Eastern Michigan', 'Florida', 'Florida Atlantic',
  'Florida International', 'Florida State', 'Fresno State', 'Georgia', 'Georgia Southern', 'Georgia State',
  'Georgia Tech', "Hawai'i", 'Houston', 'Illinois', 'Indiana', 'Iowa', 'Iowa State', 'Jacksonville State',
  'James Madison', 'Kansas', 'Kansas State', 'Kennesaw State', 'Kent State', 'Kentucky', 'Liberty', 'Louisiana',
  'Louisiana Tech', 'Louisville', 'LSU', 'Marshall', 'Maryland', 'Memphis', 'Miami', 'Miami University',
  'Michigan', 'Michigan State', 'Middle Tennessee St', 'Minnesota', 'Mississippi State', 'Missouri', 'Navy',
  'NC State', 'Nebraska', 'Nevada', 'New Mexico', 'New Mexico State', 'North Carolina', 'North Texas',
  'Northern Illinois', 'Northwestern', 'Notre Dame', 'Ohio', 'Ohio State', 'Oklahoma', 'Oklahoma State',
  'Old Dominion', 'Ole Miss', 'Oregon', 'Oregon State', 'Penn State', 'Pittsburgh', 'Purdue', 'Rice', 'Rutgers',
  'Sam Houston', 'San Diego State', 'San Jose State', 'SMU', 'South Alabama', 'South Carolina',
  'Southern Mississippi', 'Stanford', 'Syracuse', 'TCU', 'Temple', 'Tennessee', 'Texas', 'Texas A&M',
  'Texas State', 'Texas Tech', 'Toledo', 'Troy', 'Tulane', 'Tulsa', 'UAB', 'UCF', 'UCLA', 'UConn', 'UL Monroe',
  'UMass', 'UNLV', 'USC', 'USF', 'Utah', 'Utah State', 'UTEP', 'UTSA', 'Vanderbilt', 'Virginia',
  'Virginia Tech', 'Wake Forest', 'Washington', 'Washington State', 'West Virginia', 'Western Kentucky',
  'Western Michigan', 'Wisconsin', 'Wyoming',
];

function normalizeCollegeLogoKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\bst\.?\b/g, 'state')
    .replace(/\buniv(?:ersity)?\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

const COLLEGE_TEAM_LOGO_ALIASES = {
  appstate: 3,
  appalachianst: 3,
  cal: 17,
  calgoldenbears: 17,
  hawaii: 37,
  louisianalafayette: 51,
  ull: 51,
  miamifl: 58,
  miamihurricanes: 58,
  miamioh: 59,
  miamiredhawks: 59,
  middletennessee: 62,
  middletennesseestate: 62,
  ncstate: 67,
  northcarolinastate: 67,
  olemiss: 82,
  mississippi: 82,
  southernmiss: 96,
  southernmississippi: 96,
  ulm: 114,
  louisianamonroe: 114,
  uconn: 113,
  connecticut: 113,
  ohiost: 78,
  ohiostatebuckeyes: 78,
};

const COLLEGE_TEAM_LOGO_BY_NAME = COLLEGE_TEAM_LOGO_NAMES.reduce((out, name, index) => {
  out[normalizeCollegeLogoKey(name)] = index;
  return out;
}, Object.fromEntries(Object.entries(COLLEGE_TEAM_LOGO_ALIASES).map(([key, value]) => [normalizeCollegeLogoKey(key), value])));

function collegeLogoUrlForOption(option) {
  const candidates = [
    option?.teamLogoId,
    option?.logoAssetId,
    option?.teamDbName,
    option?.displayName,
    option?.longName,
    option?.label,
    option?.nickname ? `${option?.displayName || option?.label || ''} ${option.nickname}` : '',
    option?.abbrev,
  ];
  for (const candidate of candidates) {
    const key = normalizeCollegeLogoKey(candidate);
    if (Object.prototype.hasOwnProperty.call(COLLEGE_TEAM_LOGO_BY_NAME, key)) {
      return teamLogoUrl(COLLEGE_TEAM_LOGO_BY_NAME[key]);
    }
  }
  return teamLogoUrl(option?.rowIndex);
}

function conferenceLogoForCgid(cgid, rosterFamily = 'college') {
  const conference = rosterFamily === 'madden'
    ? MADDEN_CONFERENCE_LOGOS_BY_CGID[String(cgid)]
    : CONFERENCE_LOGOS_BY_CGID[String(cgid)];
  if (!conference) return null;
  if (rosterFamily === 'madden') {
    return {
      ...conference,
      url: `/conference-logos/${conference.file}?v=${CONFERENCE_LOGO_ASSET_VERSION}`,
    };
  }
  return {
    ...conference,
    url: `/conference-logos/${conference.file}?v=${CONFERENCE_LOGO_ASSET_VERSION}`,
  };
}

function teamLogoUrlForRoster(option, rosterFamily = 'college') {
  if (!option) return '';
  if (rosterFamily === 'madden') {
    const rawFallbackKey = String(option.teamDbName || option.displayName || option.label || '').toLowerCase().trim();
    const normalizedFallbackKey = rawFallbackKey.startsWith('teamdb_') ? rawFallbackKey.slice('teamdb_'.length) : rawFallbackKey;
    const logoId = option.teamLogoId ?? option.logoAssetId ?? NFL_TEAM_LOGO_FALLBACKS[normalizedFallbackKey] ?? NFL_TEAM_LOGO_FALLBACKS[rawFallbackKey] ?? '';
    if (logoId === undefined || logoId === null || logoId === '') return '';
    if (logoId === 'NFL') {
      return `/conference-logos/NFL.png?v=${CONFERENCE_LOGO_ASSET_VERSION}`;
    }
    return `/NFL_Logos/${logoId}.png?v=${CONFERENCE_LOGO_ASSET_VERSION}`;
  }
  return collegeLogoUrlForOption(option);
}

function fallbackLogoUrlForRoster(option, rosterFamily = 'college') {
  if (!option) return '';
  if (rosterFamily !== 'madden') return teamLogoUrl(option.rowIndex);
  const rawFallbackKey = String(option.teamDbName || option.displayName || option.label || '').toLowerCase().trim();
  const normalizedFallbackKey = rawFallbackKey.startsWith('teamdb_') ? rawFallbackKey.slice('teamdb_'.length) : rawFallbackKey;
  const fallbackId = NFL_TEAM_LOGO_FALLBACKS[normalizedFallbackKey] ?? NFL_TEAM_LOGO_FALLBACKS[rawFallbackKey] ?? '';
  if (fallbackId === '') return '';
  if (fallbackId === 'NFL') {
    return `/conference-logos/NFL.png?v=${CONFERENCE_LOGO_ASSET_VERSION}`;
  }
  return `/NFL_Logos/${fallbackId}.png?v=${CONFERENCE_LOGO_ASSET_VERSION}`;
}

function formatHeight(value) {
  const inches = Number(value);
  if (!Number.isFinite(inches) || inches <= 0) return valueText(value);
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

function formatWeight(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return valueText(value);
  return String(raw + 160);
}

function parseHeightDisplay(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d+)\s*'\s*(\d+)\s*"?$/);
  if (match) return String((Number(match[1]) * 12) + Number(match[2]));
  return text;
}

function parseWeightDisplay(value) {
  const text = String(value ?? '').trim();
  if (/^-?\d+$/.test(text)) {
    const numeric = Number(text);
    if (numeric >= 160) return String(numeric - 160);
  }
  return text;
}

function displayValueForColumn(col, value) {
  if (col === 'PWGT') return formatWeight(value);
  if (col === 'PHGT') return formatHeight(value);
  if (col === 'Height Inches') return formatHeight(value);
  if (col === 'PPOS') return PLAYER_POSITION_LABELS[valueText(value)] || valueText(value);
  return valueText(value);
}

function normalizePlayerClass(value) {
  const text = valueText(value);
  return ({ 0: 'Fr', 1: 'So', 2: 'Jr', 3: 'Sr', 4: 'RS' })[text] || text;
}

function normalizePlayerEXP(value) {
  return valueText(value);
}

function isRedshirtStatus(value) {
  const text = valueText(value);
  return text === '2' || text === '3';
}

function HeaderRatingTile({ value, label }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <span className="header-rating-tile">
      <strong>{valueText(value)}</strong>
      <small>{label}</small>
    </span>
  );
}

function navOptionStyle(option) {
  return {
    background: texturedTeamBackground(option),
    color: '#ffffff',
    textShadow: '0 1px 2px rgba(0,0,0,.75)',
  };
}

function selectOptionStyle(option) {
  return {
    backgroundColor: colorFromOption(option, '#101317'),
    color: '#ffffff',
  };
}

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '').trim();
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function buildDraftValues(record, columns) {
  const next = {};
  for (const col of columns || []) next[col] = valueText(record?.[col]);
  return next;
}

function orderColumns(columns, priorityCodes = []) {
  const priority = [];
  const used = new Set();
  for (const code of priorityCodes) {
    if (columns.includes(code) && !used.has(code)) {
      priority.push(code);
      used.add(code);
    }
  }
  const rest = columns.filter(code => !used.has(code));
  return [...priority, ...rest];
}

function isTeamRatingColumn(code, label = '') {
  if (TEAM_RIVAL_COLUMNS.includes(code)) return false;
  if (TEAM_COLOR_FIELD_KEYS.includes(code)) return false;
  if (TEAM_RATING_ORDER.includes(code)) return true;
  if (/^TR[A-Z0-9]+$/i.test(code) || /^TO[A-Z0-9]+$/i.test(code)) return true;
  return /rating/i.test(String(label));
}

const PLAYER_RATING_GROUPS = [
  { title: 'Offense', subgroups: [
    { title: 'Passing', codes: ['PTHP', 'PTAS', 'PTAM', 'PTAD', 'PTHA', 'PTOR', 'PTUP', 'PPLA', 'PBSK'] }, // Moved PBSK from Defense to Offense _Passing -Primetime02454 6-12-26
    { title: 'Ball Carrier', codes: ['PCAR', 'PBCV', 'PBKT', 'PELU', 'PLJM', 'PLSM', 'PLTR', 'PLSA'] },
    { title: 'Receiving', codes: ['PCTH', 'PCBT', 'PLCI', 'PLSC', 'PLRL', 'PDRR', 'PMRR','SRRN'] },
    { title: 'Blocking', codes: ['PPBK', 'PPBF', 'PPBS', 'PRBK', 'PRBF', 'PRBS', 'PLBK', 'PLIB'] },
  ] },
  { title: 'Defense', subgroups: [
    { title: 'Coverage', codes: ['PLMC', 'PLZC', 'PLPE', 'PLRE'] },
    { title: 'Pass Rush & Tackling', codes: ['PTAK', 'PLHT', 'PBSG', 'PLPU', 'PFMS', 'PLPR'] },
  ] },
  { title: 'Special Teams', subgroups: [
    { title: 'Kicking & Returns', codes: ['PKAC', 'PKPR', 'PKRT', 'PIMP'] },// Added Long Snap Rating - Primetime02454 6-12-26
  ] },
  { title: 'Athleticism', subgroups: [
    { title: 'Physical', codes: ['PSPD', 'PACC', 'PAGI', 'PSTR', 'PJMP', 'PSTA', 'PTGH'] },
  ] },
];

// Build the grouped rating layout from the flat list of rating columns a record has.
// Anything not explicitly placed falls into an "Other" group so nothing is hidden.
function buildRatingGroups(availableColumns) {
  const available = new Set(availableColumns);
  const assigned = new Set();
  const groups = [];
  for (const group of PLAYER_RATING_GROUPS) {
    const subgroups = [];
    for (const sub of group.subgroups) {
      const columns = sub.codes.filter(code => available.has(code) && !assigned.has(code));
      columns.forEach(code => assigned.add(code));
      if (columns.length) subgroups.push({ title: sub.title, columns });
    }
    const count = subgroups.reduce((sum, sub) => sum + sub.columns.length, 0);
    if (count) groups.push({ title: group.title, count, subgroups });
  }
  const leftover = availableColumns.filter(code => !assigned.has(code));
  if (leftover.length) {
    groups.push({ title: 'Other', count: leftover.length, subgroups: [{ title: 'Other Ratings', columns: leftover }] });
  }
  return groups;
}

function buildSections(columns, defs) {
  const remaining = [...columns];
  const sections = [];
  for (const def of defs) {
    const matched = [];
    if (def.codes) {
      for (const code of def.codes) {
        const index = remaining.indexOf(code);
        if (index >= 0) {
          matched.push(code);
          remaining.splice(index, 1);
        }
      }
    }
    if (def.matcher) {
      for (let i = 0; i < remaining.length;) {
        const code = remaining[i];
        if (def.matcher(code)) {
          matched.push(code);
          remaining.splice(i, 1);
        } else {
          i += 1;
        }
      }
    }
    if (matched.length) {
      sections.push({ key: def.key, title: def.title, columns: matched });
    }
  }
  if (remaining.length) {
    sections.push({ key: 'remaining', title: 'Additional Data', columns: remaining });
  }
  return sections;
}

function App() {
  const [bootstrapSessionId] = useState(() => initialSessionIdFromUrl());
  const [session, setSession] = useState(null);
  const [tables, setTables] = useState([]);
  const [currentTable, setCurrentTable] = useState('');
  const [view, setView] = useState('table');
  const [tableData, setTableData] = useState({ records: [], columns: [], total: 0, offset: 0 });
  const [tableSearch, setTableSearch] = useState('');
  const [tableSortBy, setTableSortBy] = useState('');
  const [tableSortDir, setTableSortDir] = useState('asc');
  const [tableFilterColumn, setTableFilterColumn] = useState('');
  const [tableFilterValue, setTableFilterValue] = useState('');
  const [tableListQuery, setTableListQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [tableLoadingProgress, setTableLoadingProgress] = useState(null);
  const [operationProgress, setOperationProgress] = useState(null);
  const [status, setStatus] = useState('Open a roster DB to begin.');
  const [selectedCell, setSelectedCell] = useState(null);
  const [tableMeta, setTableMeta] = useState({ labels: {} });
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceFind, setReplaceFind] = useState('');
  const [replaceWith, setReplaceWith] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const [bulkDialog, setBulkDialog] = useState(null); // 'import' | 'export' | null
  const [bulkFormat, setBulkFormat] = useState('csv'); // 'csv' | 'json'
  const bulkImportFormatRef = useRef('csv');
  const [mobileNavOpen, setMobileNavOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth <= 1360 : false);
  const fileRef = useRef(null);
  const csvBundleRef = useRef(null);
  const tableCsvRef = useRef(null);
  const visualsCsvRef = useRef(null);
  const jsonImportRef = useRef(null);
  const visualsJsonRef = useRef(null);
  const menuBarRef = useRef(null);
  const mobileNavRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const operationProgressTimerRef = useRef(null);
  const tableRequestSeqRef = useRef(0);
  const tablePageCacheRef = useRef(new Map());
  const tableMetaCacheRef = useRef(new Map());
  const showTableSidebar = view === 'table';
  const currentModeLabel = EDITOR_MODE_LABELS[view] || 'Table View';
  const statusFileLabel = session?.input_file ? `Loaded ${session.input_file}` : 'No roster open';
  const topBarStatus = loading ? 'Working...' : status;
  const franchiseSession = session?.session_kind === 'franchise';
  const visualsUnsupported = session?.visuals?.supported === false;

  function beginOperationProgress(label) {
    if (operationProgressTimerRef.current) window.clearInterval(operationProgressTimerRef.current);
    setOperationProgress({ label, value: 6 });
    operationProgressTimerRef.current = window.setInterval(() => {
      setOperationProgress(current => {
        if (!current) return current;
        const cap = current.value < 35 ? 35 : current.value < 70 ? 70 : 92;
        return { ...current, value: Math.min(cap, current.value + Math.max(1, Math.round((cap - current.value) * 0.18))) };
      });
    }, 350);
  }

  function finishOperationProgress() {
    if (operationProgressTimerRef.current) {
      window.clearInterval(operationProgressTimerRef.current);
      operationProgressTimerRef.current = null;
    }
    setOperationProgress(current => current ? { ...current, value: 100 } : current);
    window.setTimeout(() => setOperationProgress(null), 260);
  }

  const playTable = useMemo(() => tables.find(t => t.name === 'PLAY' || t.path?.endsWith('.PLAY'))?.path, [tables]);
  const teamTable = useMemo(() => tables.find(t => t.name === 'TEAM' || t.path?.endsWith('.TEAM'))?.path, [tables]);
  const currentTableMeta = useMemo(() => tables.find(t => t.path === currentTable), [tables, currentTable]);
  const filteredTables = useMemo(() => {
    const needle = tableListQuery.trim().toLowerCase();
    if (!needle) return tables;
    return tables.filter(table => (`${table.path || ''} ${table.name || ''}`).toLowerCase().includes(needle));
  }, [tables, tableListQuery]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const teams = await fetchJson(`/session/${session.session_id}/team-options`);
        if (cancelled) return;
        const firstTeamId = teams?.options?.[0]?.teamId;
        await Promise.allSettled([
          fetchJson(`/session/${session.session_id}/editor-meta/TEAM`),
          fetchJson(`/session/${session.session_id}/editor-meta/PLAY`),
          firstTeamId !== undefined && firstTeamId !== null
            ? fetchJson(`/session/${session.session_id}/player-options?team_id=${firstTeamId}`)
            : fetchJson(`/session/${session.session_id}/player-options`),
        ]);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    tablePageCacheRef.current.clear();
    tableMetaCacheRef.current.clear();
  }, [session?.session_id]);

  useEffect(() => {
    if (!session?.session_id) return undefined;
    const timer = window.setInterval(() => {
      fetchJson(`/session/${session.session_id}`)
        .catch(() => {});
    }, 30000);
    return () => window.clearInterval(timer);
  }, [session?.session_id]);

  useEffect(() => {
    if (session && currentTable && view === 'table') {
      loadTable(currentTable, 0, {
        search: tableSearch,
        sortBy: tableSortBy,
        sortDir: tableSortDir,
        filterColumn: tableFilterColumn,
        filterValue: tableFilterValue,
      });
    }
  }, [session, currentTable, view]);

  useEffect(() => {
    if (session && currentTableMeta?.name) {
      const cacheKey = `${session.session_id}:${currentTableMeta.name}`;
      const cached = tableMetaCacheRef.current.get(cacheKey) || EDITOR_META_CACHE.get(cacheKey);
      if (cached) {
        setTableMeta(cached);
        return;
      }
      fetchJson(`/session/${session.session_id}/editor-meta/${currentTableMeta.name}`)
        .then(out => {
          const nextMeta = out || { labels: {} };
          rememberLimited(tableMetaCacheRef.current, cacheKey, nextMeta);
          rememberLimited(EDITOR_META_CACHE, cacheKey, nextMeta, 24);
          setTableMeta(nextMeta);
        })
        .catch(() => setTableMeta({ labels: {} }));
    } else {
      setTableMeta({ labels: {} });
    }
  }, [session, currentTableMeta?.name]);

  useEffect(() => {
    if (bootstrapSessionId) {
      loadExistingSession(bootstrapSessionId);
    }
  }, [bootstrapSessionId]);

  useEffect(() => {
    function syncCompactNav() {
      if (window.innerWidth <= 1360) {
        setMobileNavOpen(true);
      } else {
        setMobileNavOpen(false);
        setOpenMenu(null);
      }
    }
    syncCompactNav();
    window.addEventListener('resize', syncCompactNav);
    return () => window.removeEventListener('resize', syncCompactNav);
  }, []);

  useEffect(() => {
    function onPointerDown(event) {
      const insideMenuBar = menuBarRef.current?.contains(event.target);
      const insideMobilePanel = mobileNavRef.current?.contains(event.target);
      if (!insideMenuBar && !insideMobilePanel) {
        setOpenMenu(null);
      }
    }
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => () => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    if (operationProgressTimerRef.current) {
      window.clearInterval(operationProgressTimerRef.current);
    }
  }, []);

  async function onOpenFile(file) {
    if (!file) return;
    setLoading(true);
    setStatus(`Parsing ${file.name}...`);
    beginOperationProgress(`Opening ${file.name}...`);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetchWithFallback('/parse', { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      applySession(data);
      setStatus(`Loaded ${file.name}`);
    } catch (err) {
      setStatus(`Parse failed: ${err.message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
      setLoading(false);
      finishOperationProgress();
    }
  }

  async function parseSample() {
    setLoading(true);
    setStatus('Parsing bundled sample roster...');
    beginOperationProgress('Opening sample roster...');
    try {
      const data = await fetchJson('/parse-sample', { method: 'POST' });
      applySession(data);
      setStatus('Loaded bundled sample roster.');
    } catch (err) {
      setStatus(`Sample parse failed: ${err.message}`);
    } finally {
      setLoading(false);
      finishOperationProgress();
    }
  }

  async function importAllBundle(file) {
    if (!file || !session) return;
    const format = bulkImportFormatRef.current === 'json' ? 'json' : 'csv';
    const path = format === 'json'
      ? `/session/${session.session_id}/import/all-json`
      : `/session/${session.session_id}/import/all-csv`;
    setLoading(true);
    setStatus(`Importing ${file.name}...`);
    beginOperationProgress(`Importing ${file.name}...`);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetchWithFallback(path, { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      await loadExistingSession(session.session_id);
      scheduleAutosave();
      setStatus(`Imported ${format.toUpperCase()} bundle from ${file.name}.`);
    } catch (err) {
      setStatus(`Import All failed: ${err.message}`);
    } finally {
      if (csvBundleRef.current) csvBundleRef.current.value = '';
      setLoading(false);
      finishOperationProgress();
    }
  }

  function exportAllBundle(format) {
    if (!session) return;
    const path = format === 'json'
      ? `/session/${session.session_id}/export/all-json.zip`
      : `/session/${session.session_id}/export/all-csv.zip`;
    const name = format === 'json' ? 'roster_json_bundle.zip' : 'roster_csv_bundle.zip';
    downloadSessionFile(path, name);
  }

  function confirmBulkDialog() {
    const format = bulkFormat === 'json' ? 'json' : 'csv';
    const mode = bulkDialog;
    setBulkDialog(null);
    if (mode === 'export') {
      exportAllBundle(format);
    } else if (mode === 'import') {
      bulkImportFormatRef.current = format;
      csvBundleRef.current?.click();
    }
  }

  async function importCurrentCsv(file) {
    if (!file || !session || view === 'visuals' || !currentTable) return;
    setLoading(true);
    setStatus(`Importing ${file.name}...`);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetchWithFallback(`/session/${session.session_id}/import/table/${encodeURIComponent(currentTable)}.csv`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      await loadExistingSession(session.session_id);
      scheduleAutosave();
      setStatus(`Imported CSV into ${currentTableMeta?.name || currentTable}.`);
    } catch (err) {
      setStatus(`Current CSV import failed: ${err.message}`);
    } finally {
      if (tableCsvRef.current) tableCsvRef.current.value = '';
      setLoading(false);
    }
  }

  async function importVisualsCsv(file) {
    if (!file || !session || franchiseSession || visualsUnsupported) return;
    setLoading(true);
    setStatus(`Importing ${file.name}...`);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetchWithFallback(`/session/${session.session_id}/import/visuals/csv`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      await loadExistingSession(session.session_id);
      scheduleAutosave();
      setStatus(`Imported visuals CSV from ${file.name}.`);
    } catch (err) {
      setStatus(`Visuals CSV import failed: ${err.message}`);
    } finally {
      if (visualsCsvRef.current) visualsCsvRef.current.value = '';
      setLoading(false);
    }
  }

  async function importCurrentJson(file) {
    if (!file || !session) return;
    setLoading(true);
    setStatus(`Importing ${file.name}...`);
    try {
      const text = await file.text();
      const value = JSON.parse(text);
      const path = view === 'visuals'
        ? `/session/${session.session_id}/visuals-json`
        : `/session/${session.session_id}/table-json/${encodeURIComponent(currentTable)}`;
      await fetchJson(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      await loadExistingSession(session.session_id);
      scheduleAutosave();
      setStatus(`Imported JSON from ${file.name}.`);
    } catch (err) {
      setStatus(`Current JSON import failed: ${err.message}`);
    } finally {
      if (jsonImportRef.current) jsonImportRef.current.value = '';
      setLoading(false);
    }
  }

  async function importVisualsJson(file) {
    if (!file || !session || franchiseSession || visualsUnsupported) return;
    setLoading(true);
    setStatus(`Importing ${file.name}...`);
    try {
      const text = await file.text();
      const value = JSON.parse(text);
      await fetchJson(`/session/${session.session_id}/visuals-json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      await loadExistingSession(session.session_id);
      scheduleAutosave();
      setStatus(`Imported visuals JSON from ${file.name}.`);
    } catch (err) {
      setStatus(`Visuals JSON import failed: ${err.message}`);
    } finally {
      if (visualsJsonRef.current) visualsJsonRef.current.value = '';
      setLoading(false);
    }
  }

  function scheduleAutosave() {
    if (!session || franchiseSession) return;
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(async () => {
      try {
        await fetchJson(`/session/${session.session_id}/autosave`, { method: 'POST' });
        setStatus(current => current.startsWith('Downloaded ') ? current : 'Autosaved roster backup.');
      } catch (err) {
        setStatus(`Autosave failed: ${err.message}`);
      }
    }, 1200);
  }

  async function downloadSessionFile(path, fallbackName) {
    setLoading(true);
    try {
      // Desktop window: browser blob downloads do not work in WebView2, so
      // write to disk through the native save dialog instead.
      if (isDesktopApp()) {
        const api = await waitForDesktopSaveApi();
        if (!api) throw new Error('Desktop save bridge is not ready. Try again in a moment.');
        beginOperationProgress(`Saving ${fallbackName}...`);
        const result = await nativeSaveFromServer(api, path, fallbackName);
        if (result?.cancelled) {
          setStatus('Save cancelled.');
          return;
        }
        if (!result?.ok) throw new Error(result?.error || 'Save failed.');
        setStatus(`Saved ${result.path}.`);
        return;
      }
      beginOperationProgress(`Saving ${fallbackName}...`);
      const out = await downloadFile(path, fallbackName);
      setStatus(`Downloaded ${out.filename || fallbackName}.`);
    } catch (err) {
      setStatus(`Save failed: ${err.message}`);
    } finally {
      setLoading(false);
      finishOperationProgress();
    }
  }

  async function saveSessionFileAs(path, fallbackName) {
    let browserHandle = null;
    setLoading(true);
    try {
      const desktop = isDesktopApp();
      // Browser only: capture the file picker synchronously inside the click
      // gesture before any awaited work. WebView2 does not support this API.
      if (!desktop && window.showSaveFilePicker) {
        try {
          browserHandle = await window.showSaveFilePicker({ suggestedName: fallbackName });
        } catch (err) {
          if (err?.name === 'AbortError') {
            setStatus('Save As cancelled.');
            return;
          }
          browserHandle = null; // picker unavailable here; fall back to a normal download
        }
      }
      beginOperationProgress(`Preparing ${fallbackName}...`);
      if (desktop) {
        const api = await waitForDesktopSaveApi();
        if (!api) throw new Error('Desktop save bridge is not ready. Try again in a moment.');
        const result = await nativeSaveFromServer(api, path, fallbackName);
        if (result?.cancelled) {
          setStatus('Save As cancelled.');
          return;
        }
        if (!result?.ok) throw new Error(result?.error || 'Save As failed.');
        setStatus(`Saved as ${result.path}.`);
        return;
      }
      const { blob, filename } = await fetchDownloadBlob(path, fallbackName);
      const suggestedName = filename || fallbackName;
      if (browserHandle) {
        const writable = await browserHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        setStatus(`Saved as ${browserHandle.name}.`);
        return;
      }
      downloadBlob(blob, suggestedName);
      setStatus(`Downloaded ${suggestedName}.`);
    } catch (err) {
      if (err?.name === 'AbortError') {
        setStatus('Save As cancelled.');
      } else {
        setStatus(`Save As failed: ${err.message}`);
      }
    } finally {
      setLoading(false);
      finishOperationProgress();
    }
  }

  const currentCsvExportPath = view === 'visuals'
    ? `/session/${session?.session_id}/export/visuals/flat.csv`
    : currentTable ? `/session/${session?.session_id}/export/table/${encodeURIComponent(currentTable)}.csv` : '';
  const currentJsonExportPath = view === 'visuals'
    ? `/session/${session?.session_id}/export/visuals/nested.json`
    : currentTable ? `/session/${session?.session_id}/export/table/${encodeURIComponent(currentTable)}.json` : '';
  const currentCsvImportDisabled = !session || view === 'visuals' || !currentTable;
  const currentJsonImportDisabled = !session || (view !== 'visuals' && !currentTable);

  function openedFileStem() {
    const name = session?.input_file || 'roster';
    return name.replace(/\.[^.]+$/, '') || 'roster';
  }

  function saveFilename(label = 'edited') {
    const extension = session?.session_kind === 'franchise'
      ? (session.input_file?.match(/\.[^.]+$/)?.[0] || '.FTC')
      : '.db';
    return `${openedFileStem()}_${label}${extension}`;
  }

  function saveCompressedWithChoice() {
    const game = window.prompt('Compression/game target: CFB 27, Madden 27, Madden 26, Madden 25, or Same', 'Same');
    if (game === null) return;
    const query = encodeURIComponent(game.trim() || 'Same');
    downloadSessionFile(`/session/${session.session_id}/save-compressed?game=${query}`, saveFilename('compressed'));
  }

  async function loadExistingSession(sessionId) {
    if (!sessionId) return;
    setLoading(true);
    setStatus(`Loading session ${sessionId}...`);
    beginOperationProgress('Loading roster session...');
    try {
      const data = await fetchJson(`/session/${sessionId}`);
      applySession(data);
      setStatus(`Loaded ${data.session?.input_file || sessionId}`);
    } catch (err) {
      if (isSessionMissingError(err)) {
        clearSession('This editing session is no longer available. Reopen the roster file.');
      } else {
        setStatus(`Session load failed: ${err.message}`);
      }
    } finally {
      setLoading(false);
      finishOperationProgress();
    }
  }

  function applySession(data) {
    setSession(data.session);
    setTables(data.tables || []);
    const firstTeam = (data.tables || []).find(t => t.name === 'TEAM' || t.path?.endsWith('.TEAM'));
    setCurrentTable(firstTeam?.path || (data.tables || [])[0]?.path || '');
    setUndoStack([]);
    setRedoStack([]);
    setView(firstTeam ? 'team' : 'table');
    setOpenMenu(null);
    setMobileNavOpen(false);
  }

  function clearSession(message = 'Session expired. Reopen the roster file.') {
    clearSessionIdFromUrl();
    setSession(null);
    setTables([]);
    setTableListQuery('');
    setCurrentTable('');
    setTableData({ records: [], columns: [], total: 0, offset: 0 });
    setSelectedCell(null);
    setUndoStack([]);
    setRedoStack([]);
    setView('table');
    setOpenMenu(null);
    setMobileNavOpen(false);
    setStatus(message);
  }

  function handleEditorSessionInvalid() {
    clearSessionIdFromUrl();
    setStatus('Session check failed. The current roster stays visible, but reopen the file if edits stop saving.');
  }

  function handleSessionError(err, fallback) {
    const msg = err?.message || fallback;
    if (isSessionMissingError(err)) {
      clearSession('This editing session is no longer available. Reopen the roster file.');
      return true;
    }
    setStatus(fallback ? `${fallback}: ${msg}` : msg);
    return false;
  }

  async function loadTable(path = currentTable, offset = 0, options = {}) {
    if (!session || !path) return;
    const requestSeq = ++tableRequestSeqRef.current;
    const search = options.search ?? tableSearch;
    const sortBy = options.sortBy ?? tableSortBy;
    const sortDir = options.sortDir ?? tableSortDir;
    const filterColumn = options.filterColumn ?? tableFilterColumn;
    const filterValue = options.filterValue ?? tableFilterValue;
    const cacheKey = JSON.stringify({
      session: session.session_id,
      path,
      offset,
      limit: PAGE_SIZE,
      search,
      sortBy,
      sortDir,
      filterColumn,
      filterValue,
    });
    const cached = tablePageCacheRef.current.get(cacheKey);
    if (cached) {
      React.startTransition(() => setTableData(cached));
    }
    setTableLoadingProgress(cached ? 35 : 8);
    const progressTimer = window.setInterval(() => {
      if (requestSeq !== tableRequestSeqRef.current) return;
      setTableLoadingProgress(current => {
        if (current === null) return current;
        if (current < 55) return current + 7;
        if (current < 82) return current + 4;
        if (current < 94) return current + 1;
        return current;
      });
    }, 350);
    const loadingTimer = window.setTimeout(() => {
      if (requestSeq === tableRequestSeqRef.current) setLoading(true);
    }, cached ? 250 : 80);
    try {
      const q = new URLSearchParams({ offset, limit: PAGE_SIZE, search, sort_by: sortBy, sort_dir: sortDir, filter_column: filterColumn, filter_value: filterValue });
      const data = await fetchJson(`/session/${session.session_id}/table/${encodeURIComponent(path)}?${q}`);
      if (requestSeq !== tableRequestSeqRef.current) return;
      rememberLimited(tablePageCacheRef.current, cacheKey, data);
      setTableLoadingProgress(100);
      React.startTransition(() => setTableData(data));
    } catch (err) {
      if (requestSeq !== tableRequestSeqRef.current) return;
      handleSessionError(err, 'Load table failed');
    } finally {
      window.clearInterval(progressTimer);
      window.clearTimeout(loadingTimer);
      if (requestSeq === tableRequestSeqRef.current) {
        setLoading(false);
        window.setTimeout(() => {
          if (requestSeq === tableRequestSeqRef.current) setTableLoadingProgress(null);
        }, 350);
      }
    }
  }

  function selectTable(path) {
    if (!path) return;
    setCurrentTable(path);
    setView('table');
    setTableSearch('');
    setTableSortBy('');
    setTableSortDir('asc');
    setTableFilterColumn('');
    setTableFilterValue('');
    setSelectedCell(null);
    setTableData({ records: [], columns: [], total: 0, offset: 0 });
  }

  async function patchCell(tablePath, rowIndex, column, value, pushHistory = true, before = undefined) {
    if (!session || column === '__rowIndex' || column === 'TeamName' || column === 'Position') return;
    const oldValue = before === undefined
      ? tableData.records.find(r => r.__rowIndex === rowIndex)?.[column]
      : before;
    await fetchJson(`/session/${session.session_id}/cell`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_path: tablePath, row_index: rowIndex, column, value }),
    });
    if (pushHistory) {
      setUndoStack(s => [...s, { kind: 'table', tablePath, rowIndex, column, before: oldValue, after: value }]);
      setRedoStack([]);
    }
    setTableData(d => ({
      ...d,
      records: d.records.map(r => r.__rowIndex === rowIndex ? { ...r, [column]: value } : r),
    }));
    scheduleAutosave();
  }

  async function undo() {
    const change = undoStack[undoStack.length - 1];
    if (!change || change.kind !== 'table') return;
    await patchCell(change.tablePath, change.rowIndex, change.column, change.before, false, change.after);
    setUndoStack(s => s.slice(0, -1));
    setRedoStack(s => [...s, change]);
  }

  async function redo() {
    const change = redoStack[redoStack.length - 1];
    if (!change || change.kind !== 'table') return;
    await patchCell(change.tablePath, change.rowIndex, change.column, change.after, false, change.before);
    setRedoStack(s => s.slice(0, -1));
    setUndoStack(s => [...s, change]);
  }

  async function copySelection() {
    if (!selectedCell || selectedCell.scope !== 'table') return;
    const row = tableData.records.find(r => r.__rowIndex === selectedCell.rowIndex);
    const value = row ? valueText(row[selectedCell.column]) : '';
    await navigator.clipboard.writeText(value);
    setStatus('Copied selected cell.');
  }

  async function pasteSelection() {
    if (!selectedCell || selectedCell.scope !== 'table' || !session) return;
    const text = await navigator.clipboard.readText();
    const rows = text
      .replace(/\r/g, '')
      .split('\n')
      .filter((r, i, arr) => r.length || i < arr.length - 1)
      .map(r => r.split('\t').map(parsePossibleJson));
    await fetchJson(`/session/${session.session_id}/paste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_path: currentTable, start_row_index: selectedCell.rowIndex, start_column: selectedCell.column, rows }),
    });
    await loadTable(currentTable, tableData.offset, {
      search: tableSearch,
      sortBy: tableSortBy,
      sortDir: tableSortDir,
      filterColumn: tableFilterColumn,
      filterValue: tableFilterValue,
    });
    scheduleAutosave();
    setStatus('Pasted grid data.');
  }

  async function doReplace() {
    if (!replaceFind) return;
    setLoading(true);
    try {
      const res = await fetchJson(`/session/${session.session_id}/replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_path: currentTable, find: replaceFind, replace: replaceWith }),
      });
      await loadTable(currentTable, tableData.offset, {
        search: tableSearch,
        sortBy: tableSortBy,
        sortDir: tableSortDir,
        filterColumn: tableFilterColumn,
        filterValue: tableFilterValue,
      });
      scheduleAutosave();
      setStatus(`Replaced ${res.replacements} values.`);
      setReplaceOpen(false);
    } catch (err) {
      setStatus(`Replace failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  const menus = [
    {
      label: 'File',
      items: [
        { label: 'Open...', disabled: false, action: () => fileRef.current?.click() },
        { label: 'Open Sample', disabled: false, action: parseSample },
        { type: 'separator' },
        { label: 'Save', disabled: !session, action: () => downloadSessionFile(`/session/${session.session_id}/save`, saveFilename('edited')) },
        { label: 'Save As', disabled: !session, action: () => saveSessionFileAs(`/session/${session.session_id}/save-as`, saveFilename('save_as')) },
        { label: 'Save Raw', disabled: !session, action: () => downloadSessionFile(`/session/${session.session_id}/save-raw.db`, saveFilename('raw')) },
        { label: 'Save Compressed', disabled: !session, action: saveCompressedWithChoice },
        { label: 'Save As DB', disabled: !session, action: () => saveSessionFileAs(`/session/${session.session_id}/save-roster.db`, saveFilename('db')) },
        { label: 'Save As JSON', disabled: !session, action: () => downloadSessionFile(`/session/${session.session_id}/save-project.json`, 'madden_roster_editor_project.json') },
      ],
    },
    {
      label: 'Import',
      items: [
        { label: 'Import All... (CSV / JSON)', disabled: !session, action: () => { setBulkFormat('csv'); setBulkDialog('import'); } },
        { type: 'separator' },
        { label: 'Import Current CSV...', disabled: currentCsvImportDisabled, action: () => tableCsvRef.current?.click() },
        { label: 'Import Current JSON...', disabled: currentJsonImportDisabled, action: () => jsonImportRef.current?.click() },
        { type: 'separator' },
        { label: 'Import Visuals CSV...', disabled: !session || franchiseSession || visualsUnsupported, action: () => visualsCsvRef.current?.click() },
        { label: 'Import Visuals JSON...', disabled: !session || franchiseSession || visualsUnsupported, action: () => visualsJsonRef.current?.click() },
      ],
    },
    {
      label: 'Export',
      items: [
        { label: 'Export All... (CSV / JSON)', disabled: !session, action: () => { setBulkFormat('csv'); setBulkDialog('export'); } },
        { type: 'separator' },
        { label: view === 'visuals' ? 'Current View CSV' : 'Current Table CSV', disabled: !session || !currentCsvExportPath, action: () => downloadSessionFile(currentCsvExportPath, view === 'visuals' ? 'character_visuals_players_flat.csv' : `${currentTableMeta?.name || 'table'}.csv`) },
        { label: view === 'visuals' ? 'Current View JSON' : 'Current Table JSON', disabled: !session || !currentJsonExportPath, action: () => downloadSessionFile(currentJsonExportPath, view === 'visuals' ? 'character_visuals_nested.json' : `${currentTableMeta?.name || 'table'}.json`) },
        { type: 'separator' },
        { label: 'Visuals Players CSV', disabled: !session || franchiseSession, action: () => downloadSessionFile(`/session/${session.session_id}/export/visuals/flat.csv`, 'character_visuals_players_flat.csv') },
        { label: 'Visuals Nested JSON', disabled: !session || franchiseSession, action: () => downloadSessionFile(`/session/${session.session_id}/export/visuals/nested.json`, 'character_visuals_nested.json') },
        { label: 'Visuals Loadouts CSV', disabled: !session || franchiseSession, action: () => downloadSessionFile(`/session/${session.session_id}/export/visuals/loadouts.csv`, 'character_visuals_loadouts.csv') },
        { label: 'Visuals Elements CSV', disabled: !session || franchiseSession, action: () => downloadSessionFile(`/session/${session.session_id}/export/visuals/elements.csv`, 'character_visuals_loadout_elements.csv') },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', disabled: !undoStack.length, action: undo },
        { label: 'Redo', disabled: !redoStack.length, action: redo },
        { type: 'separator' },
        { label: 'Copy', disabled: !selectedCell || selectedCell.scope !== 'table', action: copySelection },
        { label: 'Paste', disabled: !selectedCell || selectedCell.scope !== 'table', action: pasteSelection },
        { label: 'Find and Replace', disabled: !session || !currentTable, action: () => setReplaceOpen(true) },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Table View', disabled: !session, action: () => setView('table') },
        { label: 'Player Editor', disabled: !playTable, action: () => { setCurrentTable(playTable); setView('player'); } },
        { label: 'Team Editor', disabled: !teamTable, action: () => { setCurrentTable(teamTable); setView('team'); } },
        { label: 'Character Visuals', disabled: !session || franchiseSession || visualsUnsupported, action: () => setView('visuals') },
      ],
    },
  ];

  return (
      <div className="app">
        <nav className="menubar" ref={menuBarRef}>
          <div className="nav-left">
            <button type="button" className="mobile-nav-toggle" aria-label="Toggle navigation" onClick={() => setMobileNavOpen(current => !current)}>☰</button>
            <div className="menu-strip">
              {menus.map(menu => (
                <Menu
                  key={menu.label}
                  {...menu}
                  open={openMenu === menu.label}
                  onToggle={() => setOpenMenu(current => current === menu.label ? null : menu.label)}
                  onClose={() => setOpenMenu(null)}
                />
              ))}
            </div>
          </div>
          <div className="nav-center" title={topBarStatus}>
            <strong>FB Roster Editor</strong>
            <span className="nav-divider">|</span>
            <span className="top-status-message">{topBarStatus}</span>
            <span className="nav-divider">|</span>
            <span className="top-file-status">{statusFileLabel}</span>
          </div>
          <div className="nav-right">
            <div className="mode-strip">
              {VIEW_BUTTONS.map(button => {
                const disabled = (button.key === 'player' && !playTable)
                  || (button.key === 'team' && !teamTable)
                  || (button.key === 'visuals' && (!session || franchiseSession || visualsUnsupported))
                  || (button.key === 'node' && !session);
                return (
                  <button
                    key={button.key}
                    className={view === button.key ? 'active' : ''}
                    disabled={disabled}
                    onClick={() => {
                      setOpenMenu(null);
                      if (button.key === 'player') setCurrentTable(playTable);
                      if (button.key === 'team') setCurrentTable(teamTable);
                      setView(button.key);
                    }}
                  >
                    {button.label}
                  </button>
                );
              })}
            </div>
          </div>
          <input ref={fileRef} className="file-input" type="file" onChange={e => onOpenFile(e.target.files?.[0])} />
          <input ref={csvBundleRef} className="file-input" type="file" accept=".zip,application/zip" onChange={e => importAllBundle(e.target.files?.[0])} />
          <input ref={tableCsvRef} className="file-input" type="file" accept=".csv,text/csv" onChange={e => importCurrentCsv(e.target.files?.[0])} />
          <input ref={visualsCsvRef} className="file-input" type="file" accept=".csv,.zip,text/csv,application/zip" onChange={e => importVisualsCsv(e.target.files?.[0])} />
          <input ref={jsonImportRef} className="file-input" type="file" accept=".json,application/json" onChange={e => importCurrentJson(e.target.files?.[0])} />
          <input ref={visualsJsonRef} className="file-input" type="file" accept=".json,application/json" onChange={e => importVisualsJson(e.target.files?.[0])} />
        </nav>
        {operationProgress && (
          <div className="global-loading-progress" role="status" aria-live="polite">
            <div className="table-loading-progress-card">
              <strong>{operationProgress.label}</strong>
              <span>{Math.round(operationProgress.value)}%</span>
              <div className="table-loading-progress-track">
                <div style={{ width: `${clampNumber(operationProgress.value, 0, 100)}%` }} />
              </div>
            </div>
          </div>
        )}
        {mobileNavOpen && (
          <div className="mobile-nav-panel" ref={mobileNavRef}>
            <div className="mobile-nav-menus">
              {menus.map(menu => (
                <Menu
                  key={`mobile-${menu.label}`}
                  {...menu}
                  open={openMenu === `mobile-${menu.label}`}
                  onToggle={() => setOpenMenu(current => current === `mobile-${menu.label}` ? null : `mobile-${menu.label}`)}
                  onClose={() => {
                    setOpenMenu(null);
                  }}
                />
              ))}
            </div>
          <div className="mobile-nav-modes">
            {VIEW_BUTTONS.map(button => {
              const disabled = (button.key === 'player' && !playTable)
                || (button.key === 'team' && !teamTable)
                || (button.key === 'visuals' && (!session || franchiseSession || visualsUnsupported))
                || (button.key === 'node' && !session);
              return (
                <button
                  key={`mobile-mode-${button.key}`}
                  className={view === button.key ? 'active' : ''}
                  disabled={disabled}
                  onClick={() => {
                    setOpenMenu(null);
                    setMobileNavOpen(false);
                    if (button.key === 'player') setCurrentTable(playTable);
                    if (button.key === 'team') setCurrentTable(teamTable);
                    setView(button.key);
                  }}
                >
                  {button.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={`workspace ${showTableSidebar ? '' : 'workspace-editor'}`}>
        {showTableSidebar && <aside className="sidebar">
          <div className="sidebar-title">Tables</div>
          <div className="table-list-controls">
            <input
              className="table-list-filter"
              placeholder="Filter tables..."
              value={tableListQuery}
              onChange={e => setTableListQuery(e.target.value)}
            />
            <select
              className="table-list-select"
              value={currentTable}
              onChange={e => {
                selectTable(e.target.value);
              }}
            >
              <option value="">Jump to table...</option>
              {filteredTables.map(t => (
                <option key={`select-${t.path}`} value={t.path}>{t.path}</option>
              ))}
            </select>
          </div>
          <div className="table-list">
            {filteredTables.map(t => (
              <button key={t.path} className={currentTable === t.path ? 'active' : ''} onClick={() => selectTable(t.path)}>
                <b>{tableDisplayName(t)}</b>
                <span>{t.records?.toLocaleString()} rows</span>
              </button>
            ))}
          </div>
        </aside>}

        <main className="main">
          {showTableSidebar && <div className="mobile-table-strip">
            {tables.map(t => (
              <button
                key={`mobile-${t.path}`}
                className={currentTable === t.path ? 'active' : ''}
                onClick={() => selectTable(t.path)}
              >
                {tableDisplayName(t)}
              </button>
            ))}
          </div>}

          {view === 'table' && (
            <TableView
              title={tableTitle(currentTable, currentTableMeta)}
              subtitle={`${tableData.total?.toLocaleString() || 0} records`}
              data={tableData}
              columnLabels={tableMeta.labels}
              search={tableSearch}
              setSearch={setTableSearch}
              sortBy={tableSortBy}
              setSortBy={setTableSortBy}
              sortDir={tableSortDir}
              setSortDir={setTableSortDir}
              filterColumn={tableFilterColumn}
              setFilterColumn={setTableFilterColumn}
              filterValue={tableFilterValue}
              setFilterValue={setTableFilterValue}
              loadPage={(offset, options) => loadTable(currentTable, offset, options)}
              onCellCommit={(rowIndex, column, value) => patchCell(currentTable, rowIndex, column, value)}
              isReadonlyColumn={column => column === '__rowIndex' || column === 'TeamName' || column === 'Position'}
              selectedCell={selectedCell}
              setSelectedCell={setSelectedCell}
              pageSize={PAGE_SIZE}
              findReplaceAction={() => setReplaceOpen(true)}
              selectionScope="table"
              loadingProgress={tableLoadingProgress}
            />
          )}
          {view === 'player' && <RecordEditor kind="Player" tablePath={playTable} session={session} patchCell={patchCell} setStatus={setStatus} onDirty={scheduleAutosave} onSessionInvalid={handleEditorSessionInvalid} />}
          {view === 'team' && <RecordEditor kind="Team" tablePath={teamTable} session={session} patchCell={patchCell} setStatus={setStatus} onDirty={scheduleAutosave} onSessionInvalid={handleEditorSessionInvalid} />}
          {view === 'visuals' && <VisualsView active={view === 'visuals'} session={session} setStatus={setStatus} selectedCell={selectedCell} setSelectedCell={setSelectedCell} onDirty={scheduleAutosave} onSessionInvalid={clearSession} />}
        </main>
      </div>

      {bulkDialog && (
        <div className="modal-backdrop" onClick={() => setBulkDialog(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{bulkDialog === 'export' ? 'Export All' : 'Import All'}</h2>
            <p>Tables: COCH, DCHT, PLAY, TCPS, TEAM + Character Visuals.</p>
            <label className="radio-row">
              <input type="radio" name="bulk-format" value="csv" checked={bulkFormat === 'csv'} onChange={() => setBulkFormat('csv')} />
              <span>CSV (default)</span>
            </label>
            <label className="radio-row">
              <input type="radio" name="bulk-format" value="json" checked={bulkFormat === 'json'} onChange={() => setBulkFormat('json')} />
              <span>JSON</span>
            </label>
            <div className="row right">
              <button onClick={() => setBulkDialog(null)}>Cancel</button>
              <button onClick={confirmBulkDialog}>{bulkDialog === 'export' ? 'Export' : 'Choose file...'}</button>
            </div>
          </div>
        </div>
      )}

      {replaceOpen && (
        <div className="modal-backdrop" onClick={() => setReplaceOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Find and Replace</h2>
            <label>Find<input value={replaceFind} onChange={e => setReplaceFind(e.target.value)} autoFocus /></label>
            <label>Replace with<input value={replaceWith} onChange={e => setReplaceWith(e.target.value)} /></label>
            <div className="row right">
              <button onClick={() => setReplaceOpen(false)}>Cancel</button>
              <button onClick={doReplace}>Replace All in {currentTable}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Menu({ label, items, open, onToggle, onClose }) {
  return (
    <div className={`menu ${open ? 'open' : ''}`}>
      <button className="menu-trigger" type="button" onClick={onToggle}>{label}</button>
      {open && <div className="menu-dropdown">
        {items.map((item, index) => item.type === 'separator' ? (
          <div key={`${label}-${index}`} className="menu-separator" />
        ) : (
          <button key={item.label} type="button" disabled={item.disabled} onClick={() => { item.action(); onClose(); }}>{item.label}</button>
        ))}
      </div>}
    </div>
  );
}

function TableView({
  title,
  subtitle,
  data,
  columnLabels,
  search,
  setSearch,
  sortBy,
  setSortBy,
  sortDir,
  setSortDir,
  filterColumn,
  setFilterColumn,
  filterValue,
  setFilterValue,
  loadPage,
  onCellCommit,
  isReadonlyColumn,
  selectedCell,
  setSelectedCell,
  pageSize,
  findReplaceAction,
  selectionScope,
  headerActions,
  loadingProgress,
}) {
  const [draftSearch, setDraftSearch] = useState(search);
  const [draftFilterValue, setDraftFilterValue] = useState(filterValue || '');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);
  const gridWrapRef = useRef(null);
  const pendingScrollLeftRef = useRef(null);
  useEffect(() => setDraftSearch(search), [search]);
  useEffect(() => setDraftFilterValue(filterValue || ''), [filterValue]);
  useEffect(() => {
    const node = gridWrapRef.current;
    if (!node) return undefined;
    function syncViewport() {
      setViewportHeight(node.clientHeight || 640);
    }
    syncViewport();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncViewport) : null;
    observer?.observe(node);
    window.addEventListener('resize', syncViewport);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncViewport);
    };
  }, []);
  useEffect(() => {
    if (pendingScrollLeftRef.current === null) return;
    const nextLeft = pendingScrollLeftRef.current;
    pendingScrollLeftRef.current = null;
    requestAnimationFrame(() => {
      if (gridWrapRef.current) gridWrapRef.current.scrollLeft = nextLeft;
    });
  }, [data.records, data.columns, data.offset, sortBy, sortDir]);
  const pageStart = data.total ? data.offset + 1 : 0;
  const pageEnd = Math.min(data.offset + pageSize, data.total);
  const visibleColumns = data.columns.filter(isVisibleTableColumn);
  const filterableColumns = visibleColumns;
  const showLabel = column => displayLabel(column, columnLabels);
  const fieldDefinitionMap = useMemo(() => {
    const out = {};
    for (const field of data.field_definitions || data.fieldDefinitions || []) {
      if (field?.name) out[String(field.name)] = field;
    }
    return out;
  }, [data.field_definitions, data.fieldDefinitions]);
  const searchPlaceholder = selectionScope === 'visuals' ? 'Search visuals...' : 'Search table...';
  const totalRows = data.records.length;
  const virtualStart = clampNumber(Math.floor(scrollTop / TABLE_ROW_HEIGHT) - TABLE_OVERSCAN, 0, totalRows);
  const virtualCount = Math.ceil(viewportHeight / TABLE_ROW_HEIGHT) + TABLE_OVERSCAN * 2;
  const virtualEnd = clampNumber(virtualStart + virtualCount, virtualStart, totalRows);
  const virtualRows = data.records.slice(virtualStart, virtualEnd);
  const topSpacerHeight = virtualStart * TABLE_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (totalRows - virtualEnd) * TABLE_ROW_HEIGHT);

  function detectColumnSortType(column) {
    const samples = (data.records || [])
      .map(row => row?.[column])
      .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
      .slice(0, 20);
    if (!samples.length) return 'text';
    return samples.every(isNumericValue) ? 'numeric' : 'text';
  }

  function nextHeaderSortDirection(column) {
    const columnType = detectColumnSortType(column);
    if (sortBy !== column) return columnType === 'numeric' ? 'desc' : 'asc';
    return sortDir === 'desc' ? 'asc' : 'desc';
  }

  function sortIndicator(column) {
    if (sortBy !== column) return '';
    return sortDir === 'desc' ? '\u2193' : '\u2191';
  }

  function runQuery(offset = 0, next = {}) {
    if (gridWrapRef.current) {
      pendingScrollLeftRef.current = gridWrapRef.current.scrollLeft;
    }
    const nextSearch = next.search ?? draftSearch;
    const nextSortBy = next.sortBy ?? sortBy;
    const nextSortDir = next.sortDir ?? sortDir;
    const nextFilterColumn = next.filterColumn ?? filterColumn;
    const nextFilterValue = nextFilterColumn ? (next.filterValue ?? draftFilterValue) : '';
    setSearch(nextSearch);
    setSortBy?.(nextSortBy);
    setSortDir?.(nextSortDir);
    setFilterColumn?.(nextFilterColumn);
    setFilterValue?.(nextFilterValue);
    setDraftSearch(nextSearch);
    setDraftFilterValue(nextFilterValue);
    loadPage(offset, {
      search: nextSearch,
      sortBy: nextSortBy,
      sortDir: nextSortDir,
      filterColumn: nextFilterColumn,
      filterValue: nextFilterValue,
    });
  }

  function resetQuery() {
    runQuery(0, {
      search: '',
      sortBy: '',
      sortDir: 'asc',
      filterColumn: '',
      filterValue: '',
    });
  }

  function selectOptionsForCell(column) {
    const field = fieldDefinitionMap[column];
    if (!field) return [];
    if (field.type === 'bool') {
      return [
        { label: 'False', value: 'false' },
        { label: 'True', value: 'true' },
      ];
    }
    const enumOptions = field.enumOptions || field.enum_options || [];
    if (enumOptions.length > 0 && enumOptions.length <= 250) {
      return enumOptions.map(option => ({
        label: option.label ?? option.value,
        value: String(option.value ?? option.label ?? ''),
      }));
    }
    return [];
  }

  function valueForSelect(value) {
    if (value === true) return 'true';
    if (value === false) return 'false';
    return valueText(value);
  }

  function parseSelectValue(column, value) {
    const field = fieldDefinitionMap[column];
    if (field?.type === 'bool') return value === 'true';
    return value;
  }

  return (
    <section className="panel fullheight">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="search-tools">{headerActions}</div>
      </div>
      <div className="table-toolbar">
        <label>
          <span>Sort</span>
          <select value={sortBy} onChange={e => runQuery(0, { sortBy: e.target.value })}>
            <option value="">Default order</option>
            {filterableColumns.map(column => <option key={column} value={column}>{showLabel(column)}</option>)}
          </select>
        </label>
        <label>
          <span>Direction</span>
          <select value={sortDir} onChange={e => runQuery(0, { sortDir: e.target.value })}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
        <label>
          <span>Filter Column</span>
          <select value={filterColumn} onChange={e => runQuery(0, { filterColumn: e.target.value, filterValue: e.target.value ? draftFilterValue : '' })}>
            <option value="">Any column</option>
            {filterableColumns.map(column => <option key={column} value={column}>{showLabel(column)}</option>)}
          </select>
        </label>
        <label className="toolbar-grow">
          <span>Filter Value</span>
          <input
            placeholder="Filter value..."
            value={draftFilterValue}
            onChange={e => setDraftFilterValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') runQuery(0, { filterValue: draftFilterValue });
            }}
          />
        </label>
        <label className="toolbar-grow">
          <span>Search</span>
          <input
            placeholder={searchPlaceholder}
            value={draftSearch}
            onChange={e => setDraftSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                runQuery(0, { search: draftSearch });
              }
            }}
          />
        </label>
        <button onClick={() => runQuery(0, { search: draftSearch })}>Find</button>
        {findReplaceAction && <button onClick={findReplaceAction}>Find/Replace</button>}
        <button onClick={() => runQuery(0, { filterValue: draftFilterValue })}>Apply</button>
        <button onClick={resetQuery}>Reset</button>
        <button disabled={data.offset <= 0} onClick={() => runQuery(Math.max(0, data.offset - pageSize))}>Prev</button>
        <button disabled={pageEnd >= data.total} onClick={() => runQuery(data.offset + pageSize)}>Next</button>
      </div>
      <div
        className="grid-wrap"
        ref={gridWrapRef}
        onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
      >
        {loadingProgress !== null && (
          <div className="table-loading-progress" role="status" aria-live="polite">
            <div className="table-loading-progress-card">
              <strong>Loading table data...</strong>
              <span>{Math.round(loadingProgress)}%</span>
              <div className="table-loading-progress-track">
                <div style={{ width: `${clampNumber(loadingProgress, 0, 100)}%` }} />
              </div>
            </div>
          </div>
        )}
        <table className="data-grid">
          <thead>
            <tr>
                {visibleColumns.map(column => (
                  <th
                    key={column}
                    className={sortBy === column ? 'sorted' : ''}
                    onClick={() => runQuery(0, { sortBy: column, sortDir: nextHeaderSortDirection(column) })}
                  >
                    <span>{showLabel(column)}</span>
                    {showLabel(column) !== column && <small>{column}</small>}
                    {sortBy === column && <small className="sort-indicator">{sortIndicator(column)}</small>}
                  </th>
                ))}
              </tr>
          </thead>
          <tbody>
            {topSpacerHeight > 0 && (
              <tr className="virtual-spacer-row" aria-hidden="true">
                <td colSpan={Math.max(1, visibleColumns.length)} style={{ height: topSpacerHeight }} />
              </tr>
            )}
            {virtualRows.map((row, visibleRowIndex) => {
              const rowIndex = virtualStart + visibleRowIndex;
              const rowId = row.__rowIndex ?? row['Player ID'] ?? rowIndex;
              return (
                <tr key={rowId}>
                  {visibleColumns.map(column => {
                    const readonly = isReadonlyColumn(column);
                    const selected = selectedCell?.scope === selectionScope && selectedCell?.rowIndex === rowId && selectedCell?.column === column;
                    const selectOptions = readonly ? [] : selectOptionsForCell(column);
                    return (
                      <td
                        key={column}
                        className={`${readonly ? 'readonly' : ''} ${selected ? 'selected' : ''}`}
                        contentEditable={!readonly && !selectOptions.length}
                        suppressContentEditableWarning
                        onFocus={() => setSelectedCell({ scope: selectionScope, rowIndex: rowId, column })}
                        onClick={() => setSelectedCell({ scope: selectionScope, rowIndex: rowId, column })}
                        onBlur={e => {
                          if (readonly) return;
                          const next = parsePossibleJson(e.currentTarget.innerText);
                          const prev = row[column];
                          if (valueText(prev) !== valueText(next)) {
                            onCellCommit(rowId, column, next);
                          }
                        }}
                        title={valueText(row[column])}
                      >
                        {selectOptions.length ? (
                          <select
                            className="cell-select"
                            value={valueForSelect(row[column])}
                            onChange={event => {
                              const next = parseSelectValue(column, event.target.value);
                              onCellCommit(rowId, column, next);
                            }}
                          >
                            {selectOptions.map(option => (
                              <option key={`${column}-${option.value}`} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        ) : valueText(row[column])}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {bottomSpacerHeight > 0 && (
              <tr className="virtual-spacer-row" aria-hidden="true">
                <td colSpan={Math.max(1, visibleColumns.length)} style={{ height: bottomSpacerHeight }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SpinnerField({ value, onChange, onCommit, min = -9999, max = 9999, step = 1, formatValue = valueText, parseValue = value => String(value ?? '').trim() }) {
  const [draftValue, setDraftValue] = useState(() => formatValue(value));
  useEffect(() => {
    setDraftValue(formatValue(value));
  }, [value, formatValue]);
  const parsedCurrent = Number(parseValue(draftValue) || 0);
  const numericValue = Number.isFinite(parsedCurrent) ? parsedCurrent : 0;

  function commit(nextDraft = draftValue) {
    const parsed = parseValue(nextDraft);
    onChange(parsed);
    onCommit?.(parsed);
  }

  return (
    <div className="spinner-field">
      <input
        type="text"
        inputMode="numeric"
        value={draftValue}
        min={min}
        max={max}
        step={step}
        onChange={e => setDraftValue(e.target.value)}
        onBlur={() => commit()}
      />
      <div className="spinner-buttons">
        <button type="button" onClick={() => commit(String(Math.min(max, numericValue + step)))}>+</button>
        <button type="button" onClick={() => commit(String(Math.max(min, numericValue - step)))}>-</button>
      </div>
    </div>
  );
}

const RecordNavCard = React.memo(function RecordNavCard({ option, active, onSelect, kind, style, logoUrl, rosterFamily }) {
  const topMeta = kind === 'Team' && option.ovr !== undefined && option.ovr !== null ? `${option.ovr} OVR` : '';
  const detailBits = [];
  if (rosterFamily !== 'madden' && option.teamName) detailBits.push(option.teamName);
  if (rosterFamily !== 'madden' && option.position) {
    detailBits.push(option.ovr !== undefined && option.ovr !== null ? `${option.position} - ${option.ovr} OVR` : option.position);
  } else if (kind !== 'Team' && option.ovr !== undefined && option.ovr !== null) {
    detailBits.push(`${option.ovr} OVR`);
  }
  if (option.nickname && kind === 'Team' && rosterFamily !== 'madden') detailBits.push(option.nickname);
  return (
    <button type="button" className={active ? 'active' : ''} onClick={() => onSelect(option.rowIndex)} style={style} data-active={active ? 'true' : 'false'}>
      <div className="record-card-row">
        {logoUrl && (
          <img
            className="record-card-logo"
            src={logoUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={event => {
              const fallback = fallbackLogoUrlForRoster(option, rosterFamily);
              if (!fallback || event.currentTarget.dataset.fallbackApplied === 'true') return;
              event.currentTarget.dataset.fallbackApplied = 'true';
              event.currentTarget.src = fallback;
            }}
          />
        )}
        <div className="record-card-body">
          <div className="record-card-head">
            <b>{option.label}</b>
            {topMeta && <small>{topMeta}</small>}
          </div>
          {detailBits.length > 0 && <span>{detailBits.join(' - ')}</span>}
        </div>
      </div>
    </button>
  );
});

function RecordEditor({ kind, tablePath, session, patchCell, setStatus, onDirty, onSessionInvalid }) {
  const rosterFamily = session?.roster_family || 'college';
  const visualsSupported = session?.visuals?.supported !== false;
  const [data, setData] = useState({ records: [], columns: [], total: 0, offset: 0 });
  const [query, setQuery] = useState('');
  const [teamOptions, setTeamOptions] = useState([]);
  const [playerOptions, setPlayerOptions] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedRowIndex, setSelectedRowIndex] = useState('');
  const [editorMeta, setEditorMeta] = useState({ labels: {}, gearFields: [] });
  const [draftValues, setDraftValues] = useState({});
  const [gearValues, setGearValues] = useState({});
  const [visualOptions, setVisualOptions] = useState({});
  const [bootstrapping, setBootstrapping] = useState(false);
  const [recordLoading, setRecordLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [navScrollTop, setNavScrollTop] = useState(0);
  const [navViewportHeight, setNavViewportHeight] = useState(600);
  const deferredQuery = React.useDeferredValue(query);
  const editorContentRef = useRef(null);
  const navListRef = useRef(null);
  const requestSeqRef = useRef(0);
  const visualRequestSeqRef = useRef(0);
  const collectionRequestSeqRef = useRef(0);

  useEffect(() => {
    if (session && tablePath) {
      initializeEditor();
    }
  }, [session, tablePath]);

  useEffect(() => {
    setActiveTab('info');
  }, [kind, session?.session_id, tablePath]);

  useEffect(() => {
    const node = navListRef.current;
    if (!node) return;
    const activeIndex = (kind === 'Player' ? playerOptions : teamOptions)
      .findIndex(option => String(option.rowIndex) === String(selectedRowIndex));
    if (activeIndex < 0) return;
    const top = activeIndex * NAV_ROW_HEIGHT;
    const bottom = top + NAV_ROW_HEIGHT;
    if (top < node.scrollTop || bottom > node.scrollTop + node.clientHeight) {
      node.scrollTop = Math.max(0, top - NAV_ROW_HEIGHT * 2);
    }
  }, [selectedRowIndex, playerOptions, teamOptions, kind]);

  useEffect(() => {
    const node = navListRef.current;
    if (!node) return undefined;
    function syncNavViewport() {
      setNavViewportHeight(node.clientHeight || 600);
    }
    syncNavViewport();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncNavViewport) : null;
    observer?.observe(node);
    window.addEventListener('resize', syncNavViewport);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncNavViewport);
    };
  }, []);

  async function initializeEditor() {
    const requestSeq = ++requestSeqRef.current;
    setBootstrapping(true);
    setSelectedTeam('');
    setSelectedPosition('');
    setSelectedRowIndex('');
    setDraftValues({});
    setGearValues({});
    setVisualOptions({});
    try {
      const prepPromise = Promise.all([loadMeta(), loadVisualOptions()]);
      const teams = await fetchJson(`/session/${session.session_id}/team-options`);
      if (requestSeq !== requestSeqRef.current) return;
      const teamList = teams.options || [];
      setTeamOptions(teamList);
      const defaultTeamId = teamList[0]?.teamId !== undefined && teamList[0]?.teamId !== null ? String(teamList[0].teamId) : '';
      const defaultTeamRow = teamList[0]?.rowIndex !== undefined && teamList[0]?.rowIndex !== null ? String(teamList[0].rowIndex) : '';
      if (kind === 'Team') {
        const firstTeam = teamList[0];
        setSelectedTeam(defaultTeamRow);
        if (firstTeam) {
          setSelectedRowIndex(String(firstTeam.rowIndex));
          await loadRecord(firstTeam.rowIndex, requestSeq);
        }
      } else {
        setSelectedTeam(defaultTeamId);
        const baseQ = new URLSearchParams();
        if (defaultTeamId) baseQ.set('team_id', defaultTeamId);
        const players = await fetchJson(`/session/${session.session_id}/player-options?${baseQ}`);
        if (requestSeq !== requestSeqRef.current) return;
        const options = players.options || [];
        setPlayerOptions(options);
        const firstPlayer = options[0];
        if (firstPlayer) {
          setSelectedRowIndex(String(firstPlayer.rowIndex));
          await loadRecord(firstPlayer.rowIndex, requestSeq);
        }
      }
      prepPromise.catch(() => {});
    } catch (err) {
      if (isSessionMissingError(err)) {
        onSessionInvalid?.();
        return;
      }
      setStatus?.(`Initialize ${kind.toLowerCase()} editor failed: ${err.message}`);
    } finally {
      setBootstrapping(false);
    }
  }

  async function loadMeta() {
    try {
      const name = kind === 'Player' ? 'PLAY' : 'TEAM';
      const cacheKey = `${session.session_id}:${name}`;
      const cached = EDITOR_META_CACHE.get(cacheKey);
      if (cached) {
        setEditorMeta(cached);
        return;
      }
      const out = await fetchJson(`/session/${session.session_id}/editor-meta/${name}`);
      const nextMeta = out || { labels: {}, gearFields: [] };
      rememberLimited(EDITOR_META_CACHE, cacheKey, nextMeta, 24);
      setEditorMeta(nextMeta);
    } catch (err) {
      if (isSessionMissingError(err)) {
        onSessionInvalid?.();
        return;
      }
      setStatus?.(`Load ${kind.toLowerCase()} metadata failed: ${err.message}`);
    }
  }

  async function loadVisualOptions() {
    if (kind !== 'Player' || !visualsSupported) return;
    try {
      const cacheKey = session.session_id;
      const cached = VISUAL_OPTIONS_CACHE.get(cacheKey);
      if (cached) {
        setVisualOptions(cached);
        return;
      }
      const out = await fetchJson(`/session/${session.session_id}/visual-options`);
      const nextOptions = out.fields || {};
      rememberLimited(VISUAL_OPTIONS_CACHE, cacheKey, nextOptions, 8);
      setVisualOptions(nextOptions);
    } catch (err) {
      if (isSessionMissingError(err)) {
        onSessionInvalid?.();
        return;
      }
      setVisualOptions({});
    }
  }

  async function loadFilters(teamId = selectedTeam, position = selectedPosition, search = query, autoSelectFirst = false) {
    if (!session) return;
    const requestSeq = ++requestSeqRef.current;
    try {
      const teams = teamOptions.length ? { options: teamOptions } : await fetchJson(`/session/${session.session_id}/team-options`);
      if (requestSeq !== requestSeqRef.current) return;
      setTeamOptions(teams.options || []);
      if (kind === 'Player') {
        const baseQ = new URLSearchParams();
        if (teamId) baseQ.set('team_id', teamId);
        if (search) baseQ.set('search', search);
        const basePlayers = await fetchJson(`/session/${session.session_id}/player-options?${baseQ}`);
        if (requestSeq !== requestSeqRef.current) return;
        const allOptions = basePlayers.options || [];
        if (position) {
          const filteredQ = new URLSearchParams(baseQ);
          filteredQ.set('position', position);
          const players = await fetchJson(`/session/${session.session_id}/player-options?${filteredQ}`);
          if (requestSeq !== requestSeqRef.current) return;
          const options = players.options || [];
          setPlayerOptions(options);
          if (autoSelectFirst && options[0]) {
            setSelectedRowIndex(String(options[0].rowIndex));
            await loadRecord(options[0].rowIndex, requestSeq);
          }
        } else {
          setPlayerOptions(allOptions);
          if (autoSelectFirst && allOptions[0]) {
            setSelectedRowIndex(String(allOptions[0].rowIndex));
            await loadRecord(allOptions[0].rowIndex, requestSeq);
          }
        }
      }
      if (kind === 'Team' && autoSelectFirst) {
        const needle = search.trim().toLowerCase();
        const options = (teams.options || []).filter(option => (
          !needle
          || String(option.label || '').toLowerCase().includes(needle)
          || String(option.nickname || '').toLowerCase().includes(needle)
          || String(option.abbrev || '').toLowerCase().includes(needle)
          || String(option.teamId ?? '').includes(needle)
        ));
        if (options[0]) {
          setSelectedTeam(String(options[0].rowIndex));
          setSelectedRowIndex(String(options[0].rowIndex));
          await loadRecord(options[0].rowIndex, requestSeq);
        }
      }
    } catch (err) {
      if (isSessionMissingError(err)) {
        onSessionInvalid?.();
        return;
      }
      setTeamOptions([]);
      setPlayerOptions([]);
      setStatus?.(`Load ${kind.toLowerCase()} filters failed: ${err.message}`);
    }
  }

  async function refreshEditorCollections({
    teamId = selectedTeam,
    position = selectedPosition,
    search = query,
  } = {}) {
    if (!session) return;
    const requestSeq = ++collectionRequestSeqRef.current;
    try {
      const teams = await fetchJson(`/session/${session.session_id}/team-options`);
      if (requestSeq !== collectionRequestSeqRef.current) return;
      const nextTeamOptions = teams.options || [];
      setTeamOptions(nextTeamOptions);

      if (kind === 'Player') {
        const baseQ = new URLSearchParams();
        if (teamId) baseQ.set('team_id', teamId);
        if (search) baseQ.set('search', search);
        if (position) baseQ.set('position', position);
        const players = await fetchJson(`/session/${session.session_id}/player-options?${baseQ}`);
        if (requestSeq !== collectionRequestSeqRef.current) return;
        setPlayerOptions(players.options || []);
      }
    } catch (err) {
      if (!isSessionMissingError(err)) setStatus?.(`Refresh ${kind.toLowerCase()} list failed: ${err.message}`);
    }
  }

  async function loadRecord(rowIndex, requestSeq = ++requestSeqRef.current) {
    if (rowIndex === '' || rowIndex === undefined || rowIndex === null) return;
    setSelectedRowIndex(String(rowIndex));
    if (kind === 'Team') setSelectedTeam(String(rowIndex));
    setRecordLoading(true);
    const q = new URLSearchParams({ offset: rowIndex, limit: 1, search: '' });
    try {
      const out = await fetchJson(`/session/${session.session_id}/table/${encodeURIComponent(tablePath)}?${q}`);
      if (requestSeq !== requestSeqRef.current) return;
      setData({ ...out, total: out.total });
      const loadedRecord = out.records?.[0] || null;
      setDraftValues(buildDraftValues(loadedRecord, out.columns || []));
      if (kind === 'Player') {
        const cachedVisuals = loadedRecord?.PGID !== undefined
          ? PLAYER_VISUALS_CACHE.get(`${session.session_id}:${loadedRecord.PGID}`)
          : null;
        setGearValues(cachedVisuals?.fields || {});
      }
      if (loadedRecord?.__rowIndex !== undefined) {
        setSelectedRowIndex(String(loadedRecord.__rowIndex));
        if (kind === 'Team') {
          setSelectedTeam(String(loadedRecord.__rowIndex));
        }
      }
      if (kind === 'Player' && visualsSupported && loadedRecord?.PGID !== undefined) {
        loadPlayerVisualsInBackground(loadedRecord.PGID, requestSeq);
      } else {
        setGearValues({});
      }
      if (typeof window !== 'undefined' && window.innerWidth <= 1360) {
        requestAnimationFrame(() => {
          editorContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    } catch (err) {
      if (isSessionMissingError(err)) {
        onSessionInvalid?.();
        return;
      }
      setStatus?.(`Load ${kind.toLowerCase()} failed: ${err.message}`);
    } finally {
      if (requestSeq === requestSeqRef.current) setRecordLoading(false);
    }
  }

  function loadPlayerVisualsInBackground(playerId, recordRequestSeq) {
    const visualsCacheKey = `${session.session_id}:${playerId}`;
    if (PLAYER_VISUALS_CACHE.has(visualsCacheKey)) return;
    const visualRequestSeq = ++visualRequestSeqRef.current;
    const run = async () => {
      try {
        const visuals = await fetchJson(`/session/${session.session_id}/player-visuals/${playerId}`);
        if (recordRequestSeq !== requestSeqRef.current || visualRequestSeq !== visualRequestSeqRef.current) return;
        rememberLimited(PLAYER_VISUALS_CACHE, visualsCacheKey, visuals, 250);
        React.startTransition(() => setGearValues(visuals.fields || {}));
      } catch (err) {
        if (recordRequestSeq !== requestSeqRef.current || visualRequestSeq !== visualRequestSeqRef.current) return;
        if (!isSessionMissingError(err)) {
          setStatus?.(`Load player visuals failed: ${err.message}`);
        }
      }
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 350 });
    } else {
      window.setTimeout(run, 0);
    }
  }

  const record = data.records[0];
  const editableColumns = data.columns.filter(c => (
    !c.startsWith('__')
    && c !== 'TeamName'
    && c !== 'Position'
    && !(kind === 'Player' && rosterFamily === 'madden' && ['PYEA', 'PRSD'].includes(c))
  ));
  const orderedColumns = kind === 'Player'
    ? orderColumns(editableColumns, [...PLAYER_INFO_ORDER, ...PLAYER_MISC_ORDER, ...PLAYER_CONTRACT_ORDER])
    : orderColumns(editableColumns, [...TEAM_INFO_ORDER, ...TEAM_RATING_ORDER]);
  const sections = kind === 'Player'
    ? buildSections(orderedColumns, PLAYER_SECTION_DEFS)
    : buildSections(orderedColumns, TEAM_SECTION_DEFS);
  const sectionByKey = Object.fromEntries(sections.map(section => [section.key, section]));
  const filteredTeamOptions = useMemo(() => {
    if (kind !== 'Team') return teamOptions;
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return teamOptions;
    return teamOptions.filter(option => (
      String(option.label || '').toLowerCase().includes(needle)
      || String(option.nickname || '').toLowerCase().includes(needle)
      || String(option.abbrev || '').toLowerCase().includes(needle)
      || String(option.teamId ?? '').includes(needle)
    ));
  }, [kind, teamOptions, deferredQuery]);
  const navigationOptions = kind === 'Player' ? playerOptions : filteredTeamOptions;
  const teamNameById = useMemo(() => Object.fromEntries(teamOptions.map(option => [String(option.teamId), option.label])), [teamOptions]);
  const teamOptionById = useMemo(() => Object.fromEntries(teamOptions.map(option => [String(option.teamId), option])), [teamOptions]);
  const currentNavIndex = navigationOptions.findIndex(option => String(option.rowIndex) === String(selectedRowIndex));
  const navStart = clampNumber(Math.floor(navScrollTop / NAV_ROW_HEIGHT) - NAV_OVERSCAN, 0, navigationOptions.length);
  const navCount = Math.ceil(navViewportHeight / NAV_ROW_HEIGHT) + NAV_OVERSCAN * 2;
  const navEnd = clampNumber(navStart + navCount, navStart, navigationOptions.length);
  const visibleNavigationOptions = navigationOptions.slice(navStart, navEnd);
  const navTopSpacerHeight = navStart * NAV_ROW_HEIGHT;
  const navBottomSpacerHeight = Math.max(0, (navigationOptions.length - navEnd) * NAV_ROW_HEIGHT);
  const currentTeamOption = kind === 'Team'
    ? teamOptions.find(option => String(option.rowIndex) === String(selectedRowIndex))
      || teamOptions.find(option => String(option.rowIndex) === String(selectedTeam))
    : teamOptions.find(option => String(option.teamId) === String(selectedTeam));
  const selectedPlayerOption = playerOptions.find(option => String(option.rowIndex) === String(selectedRowIndex));
  const currentRecordTeamOption = kind === 'Player'
    ? teamOptionById[String(record?.TGID ?? selectedPlayerOption?.teamId ?? selectedTeam)]
    : currentTeamOption;
  const currentTeamLogo = teamLogoUrlForRoster(currentRecordTeamOption, rosterFamily);
  const playerFirstName = valueText(draftValues.PFNA ?? record?.PFNA ?? selectedPlayerOption?.label?.split?.(' ')?.[0] ?? record?.firstName ?? '');
  const playerLastName = valueText(draftValues.PLNA ?? record?.PLNA ?? (selectedPlayerOption?.label ? selectedPlayerOption.label.split(' ').slice(1).join(' ') : record?.lastName ?? ''));
  const playerId = draftValues.PGID ?? record?.PGID ?? selectedPlayerOption?.playerId ?? '';
  const playerPortraitCandidatesList = kind === 'Player' ? playerPortraitCandidates({
    genericHeadName: gearValues['Generic Head Name'] ?? gearValues.genericHeadName ?? gearValues.PGHE ?? draftValues.PGHE ?? record?.PGHE,
    assetName: gearValues['Asset Name'] ?? gearValues.assetName ?? draftValues['Asset Name'] ?? record?.['Asset Name'],
    playerId,
    firstName: playerFirstName,
    lastName: playerLastName,
    portraitId: draftValues.PSXP ?? record?.PSXP,
  }) : [];
  const playerPortrait = playerPortraitCandidatesList[0] || '';
  const playerJerseyNumber = valueText(draftValues.PJEN ?? record?.PJEN ?? selectedPlayerOption?.jerseyNumber ?? '');
  const playerPosition = displayValueForColumn('PPOS', draftValues.PPOS ?? record?.PPOS ?? selectedPlayerOption?.positionId ?? record?.Position ?? selectedPlayerOption?.position ?? '');
  function optionLabelForColumn(col, value) {
    const current = valueText(value);
    const option = selectOptionsForColumn(col).find(option => String(option.value) === current);
    return option?.label || displayValueForColumn(col, value);
  }

  const playerArchetype = optionLabelForColumn('PLTY', draftValues.PLTY ?? record?.PLTY ?? '');
  const playerClass = normalizePlayerClass(draftValues.PYEA ?? record?.PYEA ?? '');
  const playerYearsPro = normalizePlayerEXP(draftValues.PYRP ?? record?.PYRP ?? '');
  const playerClassLabel = rosterFamily === 'madden' ? 'Years Pro' : 'Class';
  const playerClassDisplay = rosterFamily === 'madden' ? playerYearsPro : playerClass;
  const playerRedshirt = isRedshirtStatus(draftValues.PRSD ?? record?.PRSD ?? '0');
  const playerHeight = formatHeight(draftValues.PHGT ?? record?.PHGT ?? '');
  const playerWeight = formatWeight(draftValues.PWGT ?? record?.PWGT ?? '');
  const teamDisplayName = valueText(draftValues.TDNA ?? record?.TDNA ?? currentTeamOption?.displayName ?? currentTeamOption?.label ?? record?.TeamName ?? '');
  const teamLongName = valueText(draftValues.TDLN ?? record?.TDLN ?? currentTeamOption?.longName ?? '');
  const teamNickname = valueText(draftValues.TMNC ?? record?.TMNC ?? currentTeamOption?.nickname ?? '');
  const teamDbName = valueText(draftValues.TDAN ?? record?.TDAN ?? currentTeamOption?.teamDbName ?? '');
  const isFreeAgents = rosterFamily === 'madden' && /freeagents/i.test(teamDbName || teamDisplayName || teamNickname);
  const currentConference = !isFreeAgents
    ? conferenceLogoForCgid(draftValues.CGID ?? record?.CGID ?? currentTeamOption?.cgid ?? currentRecordTeamOption?.cgid, rosterFamily)
    : null;
  const primaryColor = colorStyleFromRecord(draftValues, ['TBCR', 'TBCG', 'TBCB'], colorStyleFromRecord(record, ['TBCR', 'TBCG', 'TBCB'], '#1c1f24'));
  const secondaryColor = colorStyleFromRecord(draftValues, ['TB2R', 'TB2G', 'TB2B'], colorStyleFromRecord(record, ['TB2R', 'TB2G', 'TB2B'], '#3a3d42'));
  const primaryHex = colorHexFromValues(draftValues.TBCR ?? record?.TBCR, draftValues.TBCG ?? record?.TBCG, draftValues.TBCB ?? record?.TBCB);
  const secondaryHex = colorHexFromValues(draftValues.TB2R ?? record?.TB2R, draftValues.TB2G ?? record?.TB2G, draftValues.TB2B ?? record?.TB2B);
  const tabSet = kind === 'Player' ? PLAYER_EDITOR_TABS : TEAM_EDITOR_TABS;
  const teamBrandingColumns = TEAM_COLOR_FIELD_KEYS.filter(col => (
    orderedColumns.includes(col)
    || Object.prototype.hasOwnProperty.call(record || {}, col)
    || Object.prototype.hasOwnProperty.call(draftValues || {}, col)
  ));
  const teamBrandingNameColumns = TEAM_BRANDING_NAME_COLUMNS.filter(col => orderedColumns.includes(col));
  const teamRankingColumns = ['TCRK', 'TMRK'].filter(col => orderedColumns.includes(col));
  const teamRatingColumns = orderedColumns.filter(col => isTeamRatingColumn(col, labelForField(editorMeta, col)) && !teamRankingColumns.includes(col));
  const teamInfoColumns = orderedColumns.filter(col => (
    (TEAM_INFO_ORDER.includes(col) || TEAM_INFO_EXTRA_COLUMNS.includes(col))
    && !teamRatingColumns.includes(col)
  ));
  const teamMiscColumns = orderedColumns.filter(col => (
    !teamInfoColumns.includes(col)
    && !teamRatingColumns.includes(col)
    && !teamBrandingColumns.includes(col)
    && !teamBrandingNameColumns.includes(col)
  ));
  const visibleSections = (() => {
    if (kind === 'Player') {
      if (activeTab === 'info') {
        return PLAYER_INFO_SECTIONS
          .map(section => ({ ...section, columns: section.columns.filter(col => orderedColumns.includes(col)) }))
          .filter(section => section.columns.length);
      }
      if (activeTab === 'ratings') return [sectionByKey.ratings].filter(Boolean);
      if (activeTab === 'contract') return [sectionByKey.contract].filter(Boolean);
      return [sectionByKey.misc, sectionByKey.remaining].filter(Boolean);
    }
    if (activeTab === 'info') {
      const infoSections = [];
      const identityColumns = [...teamInfoColumns, ...teamRankingColumns].filter((col, index, arr) => !teamBrandingNameColumns.includes(col) && !teamBrandingColumns.includes(col) && arr.indexOf(col) === index);
      if (identityColumns.length) infoSections.push({ key: 'team-info', title: 'Team Information', columns: identityColumns });
      if (teamBrandingNameColumns.length) infoSections.push({ key: 'branding', title: 'Branding', columns: teamBrandingNameColumns });
      if (teamBrandingColumns.length) infoSections.push({ key: 'colors', title: 'Team Colors', columns: teamBrandingColumns });
      return infoSections;
    }
    if (activeTab === 'ratings') {
      return teamRatingColumns.length ? [{ key: 'team-ratings', title: 'Team Ratings', columns: teamRatingColumns }] : [];
    }
    if (activeTab === 'branding') {
      const brandingSections = [];
      if (teamBrandingNameColumns.length) brandingSections.push({ key: 'branding', title: 'Branding', columns: teamBrandingNameColumns });
      if (teamBrandingColumns.length) brandingSections.push({ key: 'colors', title: 'Team Colors', columns: teamBrandingColumns });
      return brandingSections;
    }
    return teamMiscColumns.length ? [{ key: 'team-other', title: 'Other Team Data', columns: teamMiscColumns }] : [];
  })();

  function gearFieldLabel(col) {
    return (visualOptions[col]?.label || col.replace('slotType: ', '').replace(/([a-z])([A-Z])/g, '$1 $2')).trim();
  }

  function mergedGearOptions(col) {
    const current = valueText(gearValues[col]);
    const base = visualOptions[col]?.options || [];
    const extra = [];
    if (!base.some(option => String(option.value) === '0')) extra.push({ label: 'None', value: '0' });
    if (current && current !== '0' && !base.some(option => String(option.value) === current)) {
      extra.push({ label: `${current} (Current)`, value: current });
    }
    return [...extra, ...base].map(option => (
      String(option.value) === '0' ? { ...option, label: 'None' } : option
    ));
  }

  function teamReferenceLabel(col, value) {
    if (kind !== 'Team') return '';
    if (!['TRV1', 'TRV2', 'TRV3'].includes(col)) return '';
    return teamNameById[String(value)] || '';
  }

  function selectOptionsForColumn(col) {
    if (kind === 'Player' && col === 'PPOS') {
      return POSITION_OPTIONS.map(option => ({ label: option.label, value: String(option.id) }));
    }
    if (kind === 'Player' && col === 'PLTY' && rosterFamily === 'madden') {
      const selectOptions = editorMeta.selectOptions?.[col] || [];
      const options = selectOptions.length ? selectOptions : MADDEN27_ARCHETYPE_OPTIONS;
      const current = valueText(draftValues[col]);
      const formatted = options.map(option => {
        const optionValue = String(option.value);
        const optionLabel = String(option.label ?? option.value ?? '');
        return {
          ...option,
          label: optionLabel.startsWith(`${optionValue} - `) ? optionLabel : `${optionValue} - ${optionLabel}`,
          value: optionValue,
        };
      });
      return formatted.some(option => option.value === current)
        ? formatted
        : [{ label: `${current} (Current)`, value: current }, ...formatted];
    }
    const fieldDefinition = editorMeta.fieldDefinitions?.[col] || editorMeta.field_definitions?.[col];
    if (fieldDefinition?.type === 'bool') {
      return [
        { label: 'False', value: 'false' },
        { label: 'True', value: 'true' },
      ];
    }
    const enumOptions = fieldDefinition?.enumOptions || fieldDefinition?.enum_options || [];
    if (enumOptions.length > 0 && enumOptions.length <= 250) {
      const current = valueText(draftValues[col]);
      const options = enumOptions.map(option => ({
        label: option.label ?? option.value,
        value: String(option.value ?? option.label ?? ''),
      }));
      return options.some(option => option.value === current)
        ? options
        : [{ label: `${current} (Current)`, value: current }, ...options];
    }
    const selectOptions = editorMeta.selectOptions?.[col] || [];
    if (selectOptions.length) {
      const current = valueText(draftValues[col]);
      const withZero = selectOptions.some(option => String(option.value) === '0')
        ? selectOptions
        : [{ label: '0', value: '0' }, ...selectOptions];

      return withZero.some(option => String(option.value) === current)
        ? withZero
        : [{ label: `${current} (Current)`, value: current }, ...withZero];
    }
    if (kind !== 'Team') return [];
    if (TEAM_RIVAL_COLUMNS.includes(col)) {
      const current = valueText(draftValues[col]);
      const options = teamOptions
        .filter(option => option.teamId !== undefined && option.teamId !== null)
        .map(option => ({
          label: `${option.label}${option.ovr !== undefined && option.ovr !== null ? ` - ${option.ovr} OVR` : ''}`,
          value: String(option.teamId),
        }));
      const withZero = options.some(option => option.value === '0')
        ? options
        : [{ label: 'No rival', value: '0' }, ...options];
      return withZero.some(option => option.value === current)
        ? withZero
        : [{ label: `${current} (Current)`, value: current }, ...options];
    }
    const options = editorMeta.selectOptions?.[col] || [];
    if (!options.length) return [];
    const current = valueText(draftValues[col]);
    const withZero = options.some(option => String(option.value) === '0')
      ? options
      : [{ label: '0', value: '0' }, ...options];
    return withZero.some(option => String(option.value) === current)
      ? withZero
      : [{ label: `${current} (Current)`, value: current }, ...options];
  }

  async function commitFieldValue(col, rawValue) {
    if (!record) return;
    const nextValue = parsePossibleJson(rawValue);
    const previousValue = record[col];
    if (valueText(previousValue) === valueText(nextValue)) return;
    const currentRowIndex = record.__rowIndex;
    await patchCell(tablePath, record.__rowIndex, col, nextValue);
    setDraftValues(current => ({ ...current, [col]: valueText(nextValue) }));
    setData(current => ({
      ...current,
      records: current.records.map(r => r.__rowIndex === currentRowIndex ? { ...r, [col]: nextValue } : r),
    }));
    if (kind === 'Team') {
      setTeamOptions(current => current.map(option => {
        if (String(option.rowIndex) !== String(currentRowIndex)) return option;
        const nextOption = { ...option };
        if (col === 'TDNA') nextOption.label = valueText(nextValue);
        if (col === 'TMNC') nextOption.nickname = valueText(nextValue);
        if (col === 'TGID') nextOption.teamId = nextValue;
        if (col === 'TROV') nextOption.ovr = nextValue;
        if (['TBCR', 'TBCG', 'TBCB'].includes(col)) {
          nextOption.primaryColor = { ...(nextOption.primaryColor || {}), [col === 'TBCR' ? 'r' : col === 'TBCG' ? 'g' : 'b']: nextValue };
        }
        if (['TB2R', 'TB2G', 'TB2B'].includes(col)) {
          nextOption.secondaryColor = { ...(nextOption.secondaryColor || {}), [col === 'TB2R' ? 'r' : col === 'TB2G' ? 'g' : 'b']: nextValue };
        }
        return nextOption;
      }));
    }
    await refreshEditorCollections({ teamId: selectedTeam, position: selectedPosition, search: query });
    setStatus?.(`Updated ${labelForEditorField(col)}.`);
  }

  async function commitField(col) {
    await commitFieldValue(col, draftValues[col]);
  }

  async function patchGearField(column, value) {
    if (!record?.PGID) return;
    try {
      await fetchJson(`/session/${session.session_id}/visuals-cell`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: String(record.PGID), column, value: parsePossibleJson(value) }),
      });
      setGearValues(current => {
        const next = { ...current, [column]: value };
        rememberLimited(PLAYER_VISUALS_CACHE, `${session.session_id}:${record.PGID}`, { fields: next }, 250);
        return next;
      });
      onDirty?.();
    } catch (err) {
      if (isSessionMissingError(err)) {
        onSessionInvalid?.();
        return;
      }
      setStatus?.(`Update gear failed: ${err.message}`);
    }
  }

  async function patchColorFields(nextValues) {
    if (!record) return;
    const updates = Object.entries(nextValues);
    setDraftValues(current => ({ ...current, ...Object.fromEntries(updates.map(([key, value]) => [key, String(value)])) }));
    for (const [column, value] of updates) {
      await patchCell(tablePath, record.__rowIndex, column, value);
    }
    setData(current => ({
      ...current,
      records: current.records.map(r => r.__rowIndex === record.__rowIndex ? { ...r, ...nextValues } : r),
    }));
    await refreshEditorCollections();
  }

  async function patchColorHex(group, hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const nextValues = group === 'primary'
      ? { TBCR: rgb.r, TBCG: rgb.g, TBCB: rgb.b }
      : { TB2R: rgb.r, TB2G: rgb.g, TB2B: rgb.b };
    await patchColorFields(nextValues);
  }

  function labelForEditorField(col) {
    if (rosterFamily === 'madden') {
      if (col === 'PYRP') return 'Years Pro';
    }
    return labelForField(editorMeta, col);
  }

  function renderField(col) {
    const selectOptions = selectOptionsForColumn(col);
    const fieldLabel = labelForEditorField(col);
    const isDisplayHeight = col === 'PHGT';
    const isDisplayWeight = col === 'PWGT';
    const spinnerFormat = isDisplayHeight
      ? formatHeight
      : isDisplayWeight
        ? formatWeight
        : valueText;
    const spinnerParse = isDisplayHeight
      ? parseHeightDisplay
      : isDisplayWeight
        ? parseWeightDisplay
        : (value => String(value ?? '').trim());
    return (
      <label key={col}>
        <span>{fieldLabel}</span>
        <small>{col}</small>
        {selectOptions.length ? (
          <select
            value={valueText(draftValues[col])}
            onChange={e => {
              const next = e.target.value;
              setDraftValues(current => ({ ...current, [col]: next }));
              commitFieldValue(col, next).catch(err => setStatus?.(`Update ${fieldLabel} failed: ${err.message}`));
            }}
          >
            {selectOptions.map(option => (
              <option key={`${col}-${option.value}`} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : isNumericValue(draftValues[col]) ? (
          <SpinnerField
            value={draftValues[col] ?? ''}
            onChange={value => setDraftValues(current => ({ ...current, [col]: value }))}
            onCommit={parsed => commitFieldValue(col, parsed)}
            min={TEAM_COLOR_FIELDS.some(field => field.key === col) ? 0 : -9999}
            max={TEAM_COLOR_FIELDS.some(field => field.key === col) ? 255 : 9999}
            formatValue={spinnerFormat}
            parseValue={spinnerParse}
          />
        ) : (
          <input
            value={draftValues[col] ?? ''}
            onChange={e => setDraftValues(current => ({ ...current, [col]: e.target.value }))}
            onBlur={() => commitField(col).catch(err => setStatus?.(`Update ${fieldLabel} failed: ${err.message}`))}
          />
        )}
        {teamReferenceLabel(col, draftValues[col]) && !selectOptions.length && <em className="field-hint">{teamReferenceLabel(col, draftValues[col])}</em>}
      </label>
    );
  }

  const ratingGroups = kind === 'Player' && activeTab === 'ratings'
    ? buildRatingGroups(sectionByKey.ratings?.columns || [])
    : [];

  return (
    <section className={`panel fullheight editor-page editor-page-${kind.toLowerCase()}`}>
      {!record ? <div className="empty">{bootstrapping || recordLoading ? `Loading ${kind.toLowerCase()} editor...` : 'No record selected.'}</div> : (
          <div className="editor-shell">
            <aside className="editor-nav">
            <div className="nav-controls">
              <label>
                <span>Team</span>
                <select
                  value={selectedTeam}
                  style={currentTeamOption ? navOptionStyle(currentTeamOption) : undefined}
                  onChange={async e => {
                    const teamValue = e.target.value;
                    setSelectedTeam(teamValue);
                    if (kind === 'Player') {
                      setSelectedRowIndex('');
                      await loadFilters(teamValue, selectedPosition, query, true);
                    } else {
                      const match = teamOptions.find(option => String(option.rowIndex) === String(teamValue));
                      if (match) {
                        setSelectedRowIndex(String(match.rowIndex));
                        await loadRecord(match.rowIndex);
                      }
                    }
                  }}
                >
                  <option value="">{kind === 'Player' ? 'All teams' : 'Select team'}</option>
                  {teamOptions.map(option => (
                    <option
                      key={`${option.teamId}-${option.rowIndex}`}
                      value={kind === 'Player' ? option.teamId : option.rowIndex}
                      style={selectOptionStyle(option)}
                    >
                      {option.label}{option.ovr !== undefined && option.ovr !== null ? ` - ${option.ovr} OVR` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {kind === 'Player' && (
                <>
                  <label>
                    <span>Position</span>
                    <select
                      value={selectedPosition}
                      onChange={async e => {
                        const nextPosition = e.target.value;
                        setSelectedPosition(nextPosition);
                        setSelectedRowIndex('');
                        await loadFilters(selectedTeam, nextPosition, query, true);
                      }}
                    >
                      <option value="">All positions</option>
                      {POSITION_OPTIONS.map(position => (
                        <option key={position.id} value={position.label}>{position.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Player</span>
                    <select
                      value={selectedRowIndex}
                      style={selectedPlayerOption ? navOptionStyle(teamOptionById[String(selectedPlayerOption.teamId)]) : undefined}
                      onChange={async e => {
                        const rowIndex = e.target.value;
                        setSelectedRowIndex(rowIndex);
                        await loadRecord(rowIndex);
                      }}
                    >
                      <option value="">Select player</option>
                      {playerOptions.map(option => {
                        const teamOption = teamOptionById[String(option.teamId)];
                        return (
                          <option key={option.rowIndex} value={option.rowIndex} style={teamOption ? selectOptionStyle(teamOption) : undefined}>
                            {option.detail ? `${option.label} - ${option.detail}${option.ovr !== undefined && option.ovr !== null ? ` - ${option.ovr} OVR` : ''}` : option.label}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </>
              )}
              <div className="record-count">{currentNavIndex >= 0 ? currentNavIndex + 1 : 0} / {navigationOptions.length || data.total}</div>
            </div>
            <div className="editor-nav-list" ref={navListRef} onScroll={event => setNavScrollTop(event.currentTarget.scrollTop)}>
              {navTopSpacerHeight > 0 && <div className="virtual-nav-spacer" style={{ height: navTopSpacerHeight }} />}
              {visibleNavigationOptions.map(option => (
                  <RecordNavCard
                  key={`${option.rowIndex}-${option.teamId ?? 'na'}`}
                  kind={kind}
                  option={option}
                  rosterFamily={rosterFamily}
                  active={String(selectedRowIndex) === String(option.rowIndex)}
                  style={kind === 'Player' ? navOptionStyle(teamOptionById[String(option.teamId)]) : navOptionStyle(option)}
                  logoUrl={kind === 'Player'
                    ? teamLogoUrlForRoster(teamOptionById[String(option.teamId)], rosterFamily)
                    : teamLogoUrlForRoster(option, rosterFamily)}
                  onSelect={loadRecord}
                />
              ))}
              {navBottomSpacerHeight > 0 && <div className="virtual-nav-spacer" style={{ height: navBottomSpacerHeight }} />}
            </div>
            </aside>
            <div className="editor-content" ref={editorContentRef}>
              {recordLoading && <div className="editor-loading-banner">Loading {kind.toLowerCase()}...</div>}
              <div className="identity-card compact-identity" style={{ background: texturedTeamBackground(currentRecordTeamOption, 'rgba(20, 22, 25, .82)') }}>
                <div className="identity-main">
                  <div className="identity-title-group">
                    {kind === 'Player' ? (
                      <div className="identity-title-row player-title-row">
                        <div className={`player-visual-stack${playerPortrait ? ' has-portrait' : ' no-portrait'}`}>
                          {playerPortrait && (
                            <img
                              className="player-portrait"
                              src={playerPortrait}
                              alt={`${playerFirstName} ${playerLastName}`.trim()}
                              loading="lazy"
                              data-fallbacks={playerPortraitCandidatesList.slice(1).join('||')}
                              onError={event => {
                                const fallbackAttr = event.currentTarget.dataset.fallbacks || '';
                                const [nextCandidate, ...rest] = fallbackAttr ? fallbackAttr.split('||').filter(Boolean) : [];
                                if (nextCandidate) {
                                  event.currentTarget.dataset.fallbacks = rest.join('||');
                                  event.currentTarget.src = nextCandidate;
                                  return;
                                }
                                event.currentTarget.closest('.player-visual-stack')?.classList.add('portrait-missing');
                                event.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          {currentTeamLogo && (
                            <img
                              className="identity-logo player-logo"
                              src={currentTeamLogo}
                              alt=""
                              onError={event => {
                                const fallback = fallbackLogoUrlForRoster(currentRecordTeamOption, rosterFamily);
                                if (!fallback || event.currentTarget.dataset.fallbackApplied === 'true') return;
                                event.currentTarget.dataset.fallbackApplied = 'true';
                                event.currentTarget.src = fallback;
                              }}
                            />
                          )}
                        </div>
                        <div className="player-heading-stack">
                        <h3>{`${playerFirstName || `Player ${record.__rowIndex}`}${playerLastName ? ` ${playerLastName}` : ''}`}</h3>
                          <div className="player-header-details">
                            <div>
                              <span>Position</span>
                              <strong>{playerPosition}{playerJerseyNumber && playerJerseyNumber !== '0' ? ` #${playerJerseyNumber}` : ''}</strong>
                            </div>
                            <div>
                              <span>Archetype</span>
                              <strong>{playerArchetype}</strong>
                            </div>
                            <div>
                              <span>{playerClassLabel}</span>
                              <strong className="player-class-value">
                                <span>{playerClassDisplay}</span>
                                {rosterFamily !== 'madden' && playerRedshirt && <img className="redshirt-icon" src="/RedShirt_Icon.svg" alt="Redshirt" title="Redshirt" />}
                              </strong>
                            </div>
                            <div>
                              <span>Height & Weight</span>
                              <strong>{playerHeight}{playerWeight && playerWeight !== '0' ? ` - ${playerWeight} lbs` : ''}</strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="identity-title-row team-title-row">
                        {currentTeamLogo && (
                          <img
                            className="identity-logo team-logo"
                            src={currentTeamLogo}
                            alt=""
                            onError={event => {
                              const fallback = fallbackLogoUrlForRoster(currentRecordTeamOption, rosterFamily);
                              if (!fallback || event.currentTarget.dataset.fallbackApplied === 'true') return;
                              event.currentTarget.dataset.fallbackApplied = 'true';
                              event.currentTarget.src = fallback;
                            }}
                          />
                        )}
                        <h3>{rosterFamily === 'madden' ? `${teamLongName || teamDisplayName} ${teamDisplayName || teamNickname || ''}`.trim() : (teamDisplayName || `Team ${record.__rowIndex}`)}</h3>
                        {rosterFamily !== 'madden' && <h3>{teamNickname || ''}</h3>}
                      </div>
                    )}
                  </div>
                  <div className="chips header-stats">
                    {kind === 'Player' && <HeaderRatingTile value={record.POVR} label="OVR" />}
                    {kind === 'Team' && <HeaderRatingTile value={record.TROV} label="OVR" />}
                    {kind === 'Team' && <HeaderRatingTile value={record.TROF} label="OFF" />}
                    {kind === 'Team' && <HeaderRatingTile value={record.TRDE} label="DEF" />}
                    {kind === 'Team' && currentConference && (
                      <img className={`conference-logo conference-logo-${currentConference.file.replace(/\.[^.]+$/i, '')}`} src={currentConference.url} alt={`${currentConference.display} logo`} />
                    )}
                    {kind === 'Team' && record.TCRK !== undefined && <span>Coaches #{record.TCRK}</span>}
                    {kind === 'Team' && record.TMRK !== undefined && <span>Media #{record.TMRK}</span>}
                  </div>
              </div>
            </div>
            <div className="editor-tabs-row">
              <div className="subtabs">
                {tabSet.map(tab => (
                  <button key={tab.key} className={activeTab === tab.key ? 'active' : ''} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
                ))}
              </div>
              <div className="editor-search-inline">
                <input placeholder={`Search ${kind.toLowerCase()}...`} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadFilters(selectedTeam, selectedPosition, query, true)} />
                <button onClick={() => loadFilters(selectedTeam, selectedPosition, query, true)}>Search</button>
              </div>
            </div>
            {kind === 'Player' && activeTab === 'ratings' ? (
              ratingGroups.length ? ratingGroups.map(group => (
                <div className="editor-section" key={group.title}>
                  <div className="editor-section-head">
                    <h3>{group.title}</h3>
                    <p>{group.count} ratings</p>
                  </div>
                  {group.subgroups.map(sub => (
                    <div className="rating-subgroup" key={sub.title}>
                      <div className="rating-subgroup-head">{sub.title}</div>
                      <div className="form-grid ratings-grid">
                        {sub.columns.map(renderField)}
                      </div>
                    </div>
                  ))}
                </div>
              )) : <div className="empty">No ratings available for this record.</div>
            ) : visibleSections.map(section => (
              <div className="editor-section" key={section.key}>
                <div className="editor-section-head">
                  <h3>{section.title}</h3>
                  <p>{section.columns.length} editable values</p>
                </div>
                {kind === 'Team' && section.key === 'team-info' && (
                  <div className="team-swatches team-swatches-panel">
                    <div className="swatch-block">
                      <label className="swatch-input">
                        <input type="color" value={primaryHex} onChange={e => patchColorHex('primary', e.target.value)} />
                        <span className="color-swatch" style={{ background: primaryColor }} />
                      </label>
                      <div><strong>Primary</strong></div>
                    </div>
                    <div className="swatch-block">
                      <label className="swatch-input">
                        <input type="color" value={secondaryHex} onChange={e => patchColorHex('secondary', e.target.value)} />
                        <span className="color-swatch" style={{ background: secondaryColor }} />
                      </label>
                      <div><strong>Secondary</strong></div>
                    </div>
                  </div>
                )}
                  <div className={`form-grid ${['identity', 'team-info', 'player-core', 'player-bio'].includes(section.key) ? 'form-grid-priority' : ''}`}>
                  {section.columns.map(renderField)}
                </div>
              </div>
            ))}
            {kind === 'Player' && activeTab === 'visuals' && Object.keys(gearValues).length > 0 && (
              <div className="editor-section">
                <div className="editor-section-head">
                  <h3>Character Visuals</h3>
                  <p>Appearance and equipment values come from the visuals dataset.</p>
                </div>
                <div className="visuals-groups">
                  {[
                    { key: 'player-data', title: 'Player Data', columns: editorMeta.gearFields.filter(col => !String(col).startsWith('slotType:')) },
                    { key: 'metrics', title: 'Metrics / First Loadout', columns: editorMeta.gearFields.filter(col => /^slotType:\s(?:4[3-9]|Gut|Thighs|RearGlute|Chest|Waist|Calves)/.test(String(col))) },
                    { key: 'gear', title: 'Gear / Nested Loadouts', columns: editorMeta.gearFields.filter(col => String(col).startsWith('slotType:') && !/^slotType:\s(?:4[3-9]|Gut|Thighs|RearGlute|Chest|Waist|Calves)/.test(String(col))) },
                  ].filter(section => section.columns.length).map(section => (
                    <div className="visuals-group" key={section.key}>
                      <div className="rating-subgroup-head">{section.title}</div>
                      <div className="form-grid gear-grid">
                        {section.columns.map(col => {
                          const isSlot = String(col).startsWith('slotType:');
                          const hasOptions = (visualOptions[col]?.options || []).length > 0;
                          const readonly = col === 'Player ID';
                          return (
                            <label key={col}>
                              <span>{gearFieldLabel(col)}</span>
                              <small>{col}</small>
                              {col === 'Height Inches' ? (
                                <SpinnerField
                                  value={gearValues[col] ?? ''}
                                  onChange={value => setGearValues(current => ({ ...current, [col]: value }))}
                                  onCommit={parsed => patchGearField(col, parsed)}
                                  formatValue={formatHeight}
                                  parseValue={parseHeightDisplay}
                                />
                              ) : isSlot && hasOptions ? (
                                <select
                                  value={valueText(gearValues[col])}
                                  onChange={e => {
                                    const next = e.target.value;
                                    setGearValues(current => ({ ...current, [col]: next }));
                                    patchGearField(col, next);
                                  }}
                                >
                                  {mergedGearOptions(col).map(option => (
                                    <option key={`${col}-${option.value}`} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  value={valueText(gearValues[col])}
                                  readOnly={readonly}
                                  onChange={e => setGearValues(current => ({ ...current, [col]: e.target.value }))}
                                  onBlur={e => { if (!readonly) patchGearField(col, e.target.value); }}
                                />
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
function VisualsView({ active, session, setStatus, selectedCell, setSelectedCell, onDirty, onSessionInvalid }) {
  const [data, setData] = useState({ records: [], columns: [], total: 0, offset: 0 });
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [filterColumn, setFilterColumn] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (session && active) {
      load(0, { search });
    }
  }, [session, active]);

  async function load(offset = 0, options = {}) {
    if (!session) return;
    setLoading(true);
    setLoadError('');
    try {
      const searchValue = options.search ?? search;
      const nextSortBy = options.sortBy ?? sortBy;
      const nextSortDir = options.sortDir ?? sortDir;
      const nextFilterColumn = options.filterColumn ?? filterColumn;
      const nextFilterValue = options.filterValue ?? filterValue;
      const q = new URLSearchParams({
        offset,
        limit: VISUALS_PAGE_SIZE,
        search: searchValue,
        sort_by: nextSortBy,
        sort_dir: nextSortDir,
        filter_column: nextFilterColumn,
        filter_value: nextFilterValue,
      });
      const out = await fetchJson(`/session/${session.session_id}/visuals-table?${q}`);
      setData(out);
    } catch (err) {
      setData({ records: [], columns: [], total: 0, offset: 0 });
      setLoadError(err.message);
      if (isSessionMissingError(err)) {
        onSessionInvalid?.();
        return;
      }
      setStatus(`Visuals load failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function patchVisualCell(playerId, column, value) {
    try {
      await fetchJson(`/session/${session.session_id}/visuals-cell`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: String(playerId), column, value }),
      });
      setData(current => ({
        ...current,
        records: current.records.map(row => String(row['Player ID']) === String(playerId) ? { ...row, [column]: value } : row),
      }));
      onDirty?.();
      setStatus(`Updated visuals for player ${playerId}.`);
    } catch (err) {
      if (isSessionMissingError(err)) {
        onSessionInvalid?.();
        return;
      }
      setStatus(`Visuals edit failed: ${err.message}`);
      throw err;
    }
  }

  return (
    <TableView
      title="Character Visuals"
      subtitle={loading ? 'Loading spreadsheet view...' : loadError ? `Load problem: ${loadError}` : `${data.total?.toLocaleString() || 0} visual player rows`}
      data={data}
      columnLabels={VISUALS_LABELS}
      search={search}
      setSearch={setSearch}
      sortBy={sortBy}
      setSortBy={setSortBy}
      sortDir={sortDir}
      setSortDir={setSortDir}
      filterColumn={filterColumn}
      setFilterColumn={setFilterColumn}
      filterValue={filterValue}
      setFilterValue={setFilterValue}
      loadPage={load}
      onCellCommit={patchVisualCell}
      isReadonlyColumn={column => column === 'Player ID'}
      selectedCell={selectedCell}
      setSelectedCell={setSelectedCell}
      pageSize={VISUALS_PAGE_SIZE}
      selectionScope="visuals"
      headerActions={<button onClick={() => load(0, { search })}>Retry</button>}
    />
  );
}

function JsonNode({ name, value, depth = 0 }) {
  const isObject = value && typeof value === 'object';
  if (!isObject) {
    return (
      <div className="json-leaf" style={{ paddingLeft: `${depth * 14}px` }}>
        <span className="json-key">{name}</span>
        <span className="json-value">{valueText(value)}</span>
      </div>
    );
  }
  const entries = Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : Object.entries(value);
  return (
    <details className="json-node" open={depth < 2}>
      <summary style={{ paddingLeft: `${depth * 14}px` }}>
        <span className="json-key">{name}</span>
        <span className="json-meta">{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </summary>
      <div>
        {entries.map(([key, child]) => (
          <JsonNode key={`${name}-${key}`} name={String(key)} value={child} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}

function NodeEditor({ session, currentTable }) {
  const [mode, setMode] = useState('table');
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const parsed = useMemo(() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }, [text]);

  useEffect(() => { if (session) load(); }, [session, currentTable, mode]);

  async function load() {
    if (!session) return;
    setMessage('Loading JSON...');
    try {
      const obj = mode === 'visuals'
        ? await fetchJson(`/session/${session.session_id}/visuals-json`)
        : await fetchJson(`/session/${session.session_id}/table-json/${encodeURIComponent(currentTable)}`);
      setText(JSON.stringify(obj, null, 2));
      setMessage('Loaded.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function apply() {
    try {
      const value = JSON.parse(text);
      if (mode === 'visuals') {
        await fetchJson(`/session/${session.session_id}/visuals-json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value }),
        });
      } else {
        await fetchJson(`/session/${session.session_id}/table-json/${encodeURIComponent(currentTable)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value }),
        });
      }
      setMessage('Applied JSON edits.');
    } catch (err) {
      setMessage(`JSON apply failed: ${err.message}`);
    }
  }

  return (
    <section className="panel fullheight node-editor">
      <div className="panel-head">
        <div><h2>Node JSON Editor</h2><p>Tree view on the left, editable JSON on the right.</p></div>
        <div className="search-tools">
          <select value={mode} onChange={e => setMode(e.target.value)}>
            <option value="table">Current table</option>
            <option value="visuals">Character Visuals</option>
          </select>
          <button onClick={load}>Reload</button>
          <button onClick={() => parsed && setText(JSON.stringify(parsed))} disabled={!parsed}>Compact</button>
          <button onClick={() => parsed && setText(JSON.stringify(parsed, null, 2))} disabled={!parsed}>Pretty</button>
          <button onClick={apply}>Apply JSON</button>
        </div>
      </div>
      <div className="node-editor-body">
        <div className="node-tree">
          {parsed ? <JsonNode name={mode === 'visuals' ? 'characterVisuals' : currentTable} value={parsed} /> : <div className="empty">JSON parse preview unavailable.</div>}
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} spellCheck={false} />
      </div>
      <div className="node-status">{message}</div>
    </section>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // Keep a record in the console but never let a render error blank the app.
    console.error('FB Roster Editor render error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="app-crash">
          <h2>Something hit a snag</h2>
          <p>The editor recovered from an unexpected error. Your loaded roster is still on the server.</p>
          <pre>{String(this.state.error?.message || this.state.error)}</pre>
          <div className="row">
            <button onClick={() => this.setState({ error: null })}>Try again</button>
            <button onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

