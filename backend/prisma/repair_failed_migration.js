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

function getStatusOutput() {
  try {
    return runPrisma(['migrate', 'status']);
  } catch (error) {
    return `${error.stdout || ''}\n${error.stderr || ''}`;
  }
}

const status = getStatusOutput();
const hasFailedTarget = status.includes(migrationName) && /failed migrations|failed to apply|migrations.*failed/i.test(status);

if (!hasFailedTarget) {
  console.log(`[migration-repair] No failed ${migrationName} marker detected.`);
  process.exit(0);
}

console.log(`[migration-repair] Marking failed ${migrationName} as rolled back so deploy can re-apply clean SQL.`);
try {
  const output = runPrisma(['migrate', 'resolve', '--rolled-back', migrationName]);
  if (output.trim()) console.log(output.trim());
} catch (error) {
  console.error(error.stdout || '');
  console.error(error.stderr || error.message);
  process.exit(1);
}
