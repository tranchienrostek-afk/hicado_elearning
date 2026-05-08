const { execFileSync } = require('child_process');

const migrationName = '20260509100000_add_missing_student_notes';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function runPrisma(args) {
  return execFileSync(npx, ['prisma', ...args], {
    cwd: __dirname + '/..',
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runPrismaCapture(args) {
  try {
    return { ok: true, output: runPrisma(args) };
  } catch (error) {
    return { ok: false, output: `${error.stdout || ''}\n${error.stderr || error.message || ''}` };
  }
}

const status = runPrismaCapture(['migrate', 'status']);
const output = status.output || '';
const mentionsTarget = output.includes(migrationName);
const mentionsFailure = /failed|P3009|P3018|migrate found failed migrations/i.test(output);

if (!mentionsTarget && !mentionsFailure) {
  console.log('[migration-repair] No failed migration marker detected.');
  process.exit(0);
}

console.log(`[migration-repair] Attempting rolled-back resolve for ${migrationName}.`);
const resolved = runPrismaCapture(['migrate', 'resolve', '--rolled-back', migrationName]);
const resolvedOutput = resolved.output.trim();
if (resolvedOutput) console.log(resolvedOutput);

if (!resolved.ok) {
  const benign = /already.*rolled back|not.*failed|not found|could not be found|is not in a failed state/i.test(resolved.output);
  if (!benign) process.exit(1);
}
