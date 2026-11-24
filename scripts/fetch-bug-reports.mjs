import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const VALID_SEVERITIES = new Set(['INFO', 'WARNING', 'ERROR', 'FATAL']);
const VALID_CATEGORIES = new Set([
  'UI_UX',
  'WORKOUT_SYNC',
  'WEARABLE_TELEMETRY',
  'COMBAT_DUNGEON',
  'CRASH_EXCEPTION',
  'FEATURE_SUGGESTION',
  'OTHER',
]);
const VALID_STATUSES = new Set(['OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED']);

function loadEnvFile(filePath, allowedKeys = null) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    if (allowedKeys && !allowedKeys.has(key)) continue;
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function printHelp() {
  console.log(`Usage: npm run bugs:latest -- [options]

Fetch recent bug and crash reports from the Goki diagnostics API.

Options:
  --limit <1-100>        Max reports to fetch (default: 10)
  --severity <level>     Filter by INFO | WARNING | ERROR | FATAL
  --category <cat>       Filter by UI_UX | WORKOUT_SYNC | WEARABLE_TELEMETRY |
                         COMBAT_DUNGEON | CRASH_EXCEPTION | FEATURE_SUGGESTION | OTHER
  --status <status>      Filter by OPEN | INVESTIGATING | RESOLVED | IGNORED
  --breadcrumbs          Include stateSnapshot and last 15 breadcrumbs
  --json                 Output raw JSON response
  -h, --help             Show this help message

Environment:
  DIAGNOSTICS_API_KEY    Required API key (set in Render and .env.local)
  GOKI_API_URL           Optional server URL (falls back to EXPO_PUBLIC_API_URL
                         or https://goki-server.onrender.com)
`);
}

function parseArgs(argv) {
  const opts = {
    limit: 10,
    severity: undefined,
    category: undefined,
    status: undefined,
    breadcrumbs: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
      return opts;
    }
    if (arg === '--breadcrumbs') {
      opts.breadcrumbs = true;
      continue;
    }
    if (arg === '--json') {
      opts.json = true;
      continue;
    }
    if (arg === '--limit') {
      const next = Number(argv[++i]);
      if (!Number.isFinite(next) || next < 1) {
        throw new Error('--limit must be a positive integer between 1 and 100.');
      }
      opts.limit = Math.min(100, Math.max(1, Math.floor(next)));
      continue;
    }
    if (arg === '--severity') {
      const val = String(argv[++i] ?? '').toUpperCase();
      if (!VALID_SEVERITIES.has(val)) {
        throw new Error(`Invalid --severity "${val}".`);
      }
      opts.severity = val;
      continue;
    }
    if (arg === '--category') {
      const val = String(argv[++i] ?? '').toUpperCase();
      if (!VALID_CATEGORIES.has(val)) {
        throw new Error(`Invalid --category "${val}".`);
      }
      opts.category = val;
      continue;
    }
    if (arg === '--status') {
      const val = String(argv[++i] ?? '').toUpperCase();
      if (!VALID_STATUSES.has(val)) {
        throw new Error(`Invalid --status "${val}".`);
      }
      opts.status = val;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return opts;
}

function printMissingKeyInstructions() {
  console.error('Error: DIAGNOSTICS_API_KEY is not set.');
  console.error('');
  console.error('Setup steps:');
  console.error('  1. Generate a 64-character hex key:');
  console.error('     node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error('  2. Add DIAGNOSTICS_API_KEY=<key> to Render (goki-server -> Environment).');
  console.error('  3. Add DIAGNOSTICS_API_KEY="<key>" to .env.local in the repo root.');
  console.error('  4. Deploy the updated server, then re-run: npm run bugs:latest');
}

function formatReport(report, includeBreadcrumbs) {
  const created = report.createdAt ? new Date(report.createdAt).toISOString() : 'unknown-time';
  console.log('='.repeat(78));
  console.log(
    `[${report.severity ?? 'UNKNOWN'}] [${report.category ?? 'OTHER'}] [${report.status ?? 'OPEN'}] ${created}  id=${report.id}`
  );
  console.log(`Title: ${report.title ?? '(no title)'}`);
  if (report.userId || report.characterId) {
    console.log(
      `Actor: userId=${report.userId ?? 'anonymous'}  characterId=${report.characterId ?? 'none'}`
    );
  }
  if (report.userDescription) {
    console.log(`User Note: ${report.userDescription}`);
  }
  if (report.errorMessage) {
    console.log(`Error: ${report.errorMessage}`);
  }
  if (report.stackTrace) {
    console.log('Stack Trace:');
    console.log(report.stackTrace);
  }
  if (report.componentStack) {
    console.log('Component Stack:');
    console.log(report.componentStack);
  }
  if (includeBreadcrumbs) {
    if (report.stateSnapshot && Object.keys(report.stateSnapshot).length > 0) {
      console.log('State Snapshot:');
      console.log(JSON.stringify(report.stateSnapshot, null, 2));
    }
    const crumbs = Array.isArray(report.breadcrumbs) ? report.breadcrumbs : [];
    if (crumbs.length > 0) {
      const tail = crumbs.slice(-15);
      console.log(`Breadcrumbs (last ${tail.length} of ${crumbs.length}):`);
      for (const c of tail) {
        const ts = c.timestamp ? new Date(c.timestamp).toISOString() : '';
        const dataStr = c.data ? ` ${JSON.stringify(c.data)}` : '';
        console.log(`  - [${ts}] [${c.level ?? 'info'}] (${c.category ?? 'general'}) ${c.message}${dataStr}`);
      }
    }
  }
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  loadEnvFile(path.join(ROOT_DIR, '.env.local'));
  loadEnvFile(path.join(ROOT_DIR, '.env'));
  loadEnvFile(path.join(ROOT_DIR, 'apps', 'mobile', '.env.local'), new Set(['EXPO_PUBLIC_API_URL']));

  const apiKey = (process.env.DIAGNOSTICS_API_KEY || process.env.GOKI_DIAGNOSTICS_API_KEY || '').trim();
  if (!apiKey) {
    printMissingKeyInstructions();
    process.exit(1);
  }

  const rawBaseUrl = (
    process.env.GOKI_API_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    'https://goki-server.onrender.com'
  ).trim();
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');

  const query = new URLSearchParams();
  query.set('limit', String(opts.limit));
  if (opts.severity) query.set('severity', opts.severity);
  if (opts.category) query.set('category', opts.category);
  if (opts.status) query.set('status', opts.status);

  const url = `${baseUrl}/api/diagnostics/reports?${query.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-diagnostics-key': apiKey,
      accept: 'application/json',
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`Request failed (${response.status}): ${payload.error || response.statusText}`);
    if (response.status === 401) {
      console.error(
        'Hint: Confirm DIAGNOSTICS_API_KEY matches Render and that the updated server is deployed.'
      );
    }
    process.exit(1);
  }

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const reports = Array.isArray(payload.reports) ? payload.reports : [];
  if (reports.length === 0) {
    console.log(`No bug reports matched filters from ${baseUrl}.`);
    return;
  }

  console.log(`Fetched ${reports.length} report(s) from ${baseUrl}:`);
  for (const report of reports) {
    formatReport(report, opts.breadcrumbs);
  }
  console.log('='.repeat(78));
}

main().catch((err) => {
  console.error('Failed to fetch bug reports:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
