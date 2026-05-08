const { execSync } = require('child_process');

const migrationName = '20260509100000_add_missing_student_notes';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const cwd = __dirname + '/..';

function run(command) {
  try {
    const output = execSync(command, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, output };
  } catch (error) {
    return { ok: false, output: `${error.stdout || ''}\n${error.stderr || error.message || ''}` };
  }
}

console.log(`[migration-repair] Checking ${migrationName}.`);
const resolved = run(`${npx} prisma migrate resolve --rolled-back ${migrationName}`);
const output = resolved.output.trim();
if (output) console.log(output);

if (!resolved.ok) {
  const benign = /already.*rolled back|not.*failed|not found|could not be found|is not in a failed state|P3008/i.test(resolved.output);
  if (benign) {
    console.log('[migration-repair] No rollback needed.');
    process.exit(0);
  }
  process.exit(1);
}

console.log(`[migration-repair] Rolled back failed ${migrationName} marker if it existed.`);
