import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['--test'], {
  stdio: ['inherit', 'pipe', 'pipe'],
});

let output = '';
let summarySeen = false;

const maybeFinish = () => {
  if (summarySeen) return;

  const hasSummary = /^# tests \d+/m.test(output) && /^# pass \d+/m.test(output) && /^# fail \d+/m.test(output);
  if (!hasSummary) return;

  summarySeen = true;
  // Some provider transports can leave non-critical sockets/timers alive after the
  // OpenFeature test suite has completed. The TAP summary is the test-runner boundary:
  // terminate the child only after the complete result has been emitted.
  setTimeout(() => child.kill('SIGTERM'), 25).unref();
};

child.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
  maybeFinish();
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
});

const code = await new Promise((resolve) => {
  child.on('exit', (exitCode) => resolve(exitCode));
});

if (
  summarySeen &&
  /^# fail 0$/m.test(output) &&
  !/^# cancelled [1-9]/m.test(output)
) {
  process.exit(0);
}

process.exit(typeof code === 'number' && code !== 0 ? code : 1);
