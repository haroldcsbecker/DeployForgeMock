import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPOSITORY = process.env.DEPLOYFORGE_REPOSITORY ?? 'haroldcsbecker/DeployForgeMock';
const CONTROL_URL = (process.env.DEPLOYFORGE_MOCK_CONTROL_URL ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
const GOFF_URL = (process.env.GO_FEATURE_FLAG_ENDPOINT ?? 'http://127.0.0.1:1031').replace(/\/$/, '');
const PACKAGE_NAME = process.env.DEPLOYFORGE_GHCR_PACKAGE ?? 'deployforgemock';

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : 'pipe',
    env: process.env,
  });

  if (result.status !== 0) {
    const details = String(result.stderr || result.stdout || '').trim();
    throw new Error(command + ' ' + args.join(' ') + ' failed' + (details ? ': ' + details : ''));
  }

  return String(result.stdout ?? '').trim();
};

const runOptional = (command, args, options = {}) => {
  try {
    return run(command, args, options);
  } catch {
    return '';
  }
};

const ghJson = (args) => {
  const output = run('gh', ['api', '--paginate', ...args]);
  return output ? JSON.parse(output) : [];
};

const assertGhAuth = () => {
  run('gh', ['auth', 'status'], { inherit: true });
};

const removeGeneratedLocalState = () => {
  const generated = [
    join(ROOT, 'artifacts'),
    join(ROOT, 'environments', 'hmg', 'current'),
    join(ROOT, 'environments', 'prod', 'current'),
    join(ROOT, '.runtime-worktrees'),
  ];

  for (const path of generated) {
    if (path === ROOT || path === resolve(ROOT, '..')) {
      throw new Error('Refusing to clean unsafe path: ' + path);
    }
    rmSync(path, { recursive: true, force: true });
  }

  mkdirSync(join(ROOT, 'artifacts'), { recursive: true });
  mkdirSync(join(ROOT, 'environments', 'hmg', 'current'), { recursive: true });
  mkdirSync(join(ROOT, 'environments', 'prod', 'current'), { recursive: true });
  mkdirSync(join(ROOT, '.runtime-worktrees'), { recursive: true });
  rmSync(join(ROOT, 'origin-build.json'), { force: true });
};

const resetGoff = async () => {
  const config = readFileSync(join(ROOT, 'flags.goff.yaml'), 'utf8').trim();
  if (config !== '{}') {
    throw new Error(
      'flags.goff.yaml must be the empty GO Feature Flag map "{}" on main before running the full demo reset. ' +
      'The GOFF manifest will expose this as an empty flags array.',
    );
  }

  run('docker', ['compose', 'down', '-v', '--remove-orphans'], { inherit: true });
  run('docker', ['compose', 'up', '-d', '--force-recreate', 'go-feature-flag'], { inherit: true });

  let lastError = '';
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(GOFF_URL + '/openfeature/v0/manifest', { cache: 'no-store' });
      if (response.ok) {
        const manifest = await response.json();
        if (!Array.isArray(manifest?.flags) || manifest.flags.length !== 0) {
          throw new Error('GO Feature Flag manifest is not empty after reset');
        }
        console.log('[DeployForgeMock] GO Feature Flag reset: flags=[]');
        return;
      }
      lastError = 'HTTP ' + response.status;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  runOptional('docker', ['compose', 'logs', 'go-feature-flag'], { inherit: true });
  throw new Error('GO Feature Flag did not become healthy: ' + lastError);
};

const resetRuntime = async () => {
  removeGeneratedLocalState();

  try {
    const response = await fetch(CONTROL_URL + '/demo/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error('control API returned ' + response.status + (body ? ': ' + body : ''));
    }

    console.log('[DeployForgeMock] deployment/API state reset.');
  } catch (error) {
    console.warn(
      '[DeployForgeMock] control API reset skipped: ' +
      (error instanceof Error ? error.message : String(error)) +
      '. Local generated runtime state was still cleaned.',
    );
  }
};

const cleanGithubReleasesAndPackages = () => {
  assertGhAuth();

  const releases = ghJson([
    '/repos/' + REPOSITORY + '/releases?per_page=100',
  ]);

  for (const release of releases) {
    const tag = String(release?.tag_name ?? '');
    if (!tag) continue;
    console.log('[DeployForgeMock] deleting release ' + tag);
    run('gh', ['release', 'delete', tag, '--repo', REPOSITORY, '--yes', '--cleanup-tag']);
  }

  const refs = runOptional('gh', [
    'api',
    '--paginate',
    '/repos/' + REPOSITORY + '/git/matching-refs/tags',
  ]);
  if (refs) {
    for (const ref of JSON.parse(refs)) {
      const tag = String(ref?.ref ?? '').replace(/^refs\/tags\//, '');
      if (!tag) continue;
      if (!/^(release-|baseline-|candidate-|dirty-|base-main)/.test(tag)) continue;
      console.log('[DeployForgeMock] deleting generated tag ' + tag);
      runOptional('gh', ['api', '--method', 'DELETE', '/repos/' + REPOSITORY + '/git/refs/tags/' + tag]);
    }
  }

  try {
    const versions = ghJson([
      '/users/' + REPOSITORY.split('/')[0] + '/packages/container/' + PACKAGE_NAME + '/versions?per_page=100',
    ]);

    for (const version of versions) {
      if (!version?.id) continue;
      console.log('[DeployForgeMock] deleting GHCR package version ' + version.id);
      run('gh', [
        'api',
        '--method',
        'DELETE',
        '/users/' + REPOSITORY.split('/')[0] + '/packages/container/' + PACKAGE_NAME + '/versions/' + version.id,
      ]);
    }
  } catch (error) {
    console.warn(
      '[DeployForgeMock] GHCR cleanup skipped: ' +
      (error instanceof Error ? error.message : String(error)),
    );
  }
};

const DEMO_PR_SPECS = [
  {
    branch: 'demo/qa-ready-checkout',
    title: 'Demo QA-ready checkout fixture',
    body: 'Example PR for testing the normal DeployForge QA workflow. One commit, non-draft, and expected to be CI-ready.',
    files: {
      'examples/demo/checkout-ready.md': '# Checkout validation example\n\nDemo PR used to exercise the normal QA selection and review flow.\n',
    },
  },
  {
    branch: 'demo/qa-ready-notifications',
    title: 'Demo QA-ready notifications fixture',
    body: 'Example PR for testing selection of multiple QA-ready changes in DeployForge.',
    files: {
      'examples/demo/notifications-ready.md': '# Notifications example\n\nDemo PR used to exercise multiple QA-ready items in the interface.\n',
    },
  },
  {
    branch: 'demo/qa-draft-settings',
    title: 'Demo QA draft settings fixture',
    body: 'Example PR intentionally kept as Draft so the DeployForge interface can be tested against the Draft gate.',
    draft: true,
    files: {
      'examples/demo/draft-settings.md': '# Settings draft example\n\nDemo PR intentionally left in draft state for UI gate testing.\n',
    },
  },
  {
    branch: 'qa/checkout-flag-example',
    title: 'QA: add checkout flag example',
    body: 'Adds a valid OpenFeature example using checkout-mode.\n\nIntentionally left open for DeployForge QA flow testing.',
    files: {
      'examples/qa/checkout-flag-example.mjs':
        "import { getFeatureFlagClient } from '../../runtime/feature-flags/open-feature.mjs';\n\n" +
        "export async function checkoutFlagExample() {\n  const client = await getFeatureFlagClient('hmg');\n  return {\n    flag: 'checkout-mode',\n    value: await client.getStringValue('checkout-mode', 'legacy'),\n  };\n}\n",
      'flags.goff.yaml':
        'checkout-mode:\n' +
        '  variations:\n    legacy: "legacy"\n    new: "new"\n' +
        '  targeting:\n    - query: environment eq "hmg"\n      variation: new\n' +
        '  defaultRule:\n    variation: legacy\n' +
        '  metadata:\n    defaultValue: "legacy"\n    description: "Selects the checkout experience exposed by the application."\n',
    },
  },
  {
    branch: 'qa/payment-flag-example',
    title: 'QA: add payment flag example',
    body: 'Adds a valid OpenFeature example using payment-mode.\n\nIntentionally left open for DeployForge QA flow testing.',
    files: {
      'examples/qa/payment-flag-example.mjs':
        "import { getFeatureFlagClient } from '../../runtime/feature-flags/open-feature.mjs';\n\n" +
        "export async function paymentFlagExample() {\n  const client = await getFeatureFlagClient('hmg');\n  return {\n    flag: 'payment-mode',\n    value: await client.getStringValue('payment-mode', 'legacy'),\n  };\n}\n",
      'flags.goff.yaml':
        'payment-mode:\n' +
        '  variations:\n    legacy: "legacy"\n    new: "new"\n    canary: "canary"\n' +
        '  targeting:\n    - query: environment eq "hmg"\n      variation: canary\n' +
        '  defaultRule:\n    variation: legacy\n' +
        '  metadata:\n    defaultValue: "legacy"\n    description: "Selects the payment processor implementation used by checkout."\n',
    },
  },
  {
    branch: 'qa/fraud-flag-example',
    title: 'QA: add fraud flag example',
    body: 'Adds a valid OpenFeature example using fraud-mode.\n\nIntentionally left open for DeployForge QA flow testing.',
    files: {
      'examples/qa/fraud-flag-example.mjs':
        "import { getFeatureFlagClient } from '../../runtime/feature-flags/open-feature.mjs';\n\n" +
        "export async function fraudFlagExample() {\n  const client = await getFeatureFlagClient('hmg');\n  return {\n    flag: 'fraud-mode',\n    value: await client.getStringValue('fraud-mode', 'legacy'),\n  };\n}\n",
      'flags.goff.yaml':
        'fraud-mode:\n' +
        '  variations:\n    legacy: "legacy"\n    rule-based: "rule-based"\n' +
        '  targeting:\n    - query: environment eq "hmg"\n      variation: rule-based\n' +
        '  defaultRule:\n    variation: legacy\n' +
        '  metadata:\n    defaultValue: "legacy"\n    description: "Selects the fraud evaluation implementation used by checkout."\n',
      'index.html': null,
    },
  },
];

const addFraudIndexChange = (path) => {
  const file = join(path, 'index.html');
  let source = readFileSync(file, 'utf8');
  source = source.replace(
    '        <div class="meta">\n          <span>Runtime flag provider</span>\n          <strong>GO Feature Flag / OpenFeature</strong>\n        </div>',
    '        <div class="meta">\n          <span>Runtime flag provider</span>\n          <strong>GO Feature Flag / OpenFeature</strong>\n        </div>\n        <div class="meta">\n          <span>PR flag test</span>\n          <strong id="pr-flag-test">loading…</strong>\n        </div>',
  );
  source = source.replace(
    '          document.querySelector("#fraud-evaluation").textContent =\n            String(payload.order?.payment?.fraudImplementationId || "unknown");',
    '          const fraudMode = payload.order?.featureFlags?.["fraud-mode"];\n' +
    '          document.querySelector("#fraud-evaluation").textContent =\n' +
    '            String(payload.order?.payment?.fraudImplementationId || "unknown");\n' +
    '          document.querySelector("#pr-flag-test").textContent =\n' +
    '            "fraud-mode = " + String(fraudMode || "unknown");',
  );

  writeFileSync(file, source, 'utf8');
};

const recreateDemoPrs = () => {
  assertGhAuth();
  run('git', ['fetch', 'origin', 'main', '--quiet']);

  const existing = JSON.parse(run('gh', [
    'pr',
    'list',
    '--repo',
    REPOSITORY,
    '--state',
    'open',
    '--limit',
    '100',
    '--json',
    'number,title,headRefName',
  ]));

  const branches = new Set(DEMO_PR_SPECS.map((spec) => spec.branch));
  for (const pr of existing) {
    const branch = String(pr?.headRefName ?? '');
    const title = String(pr?.title ?? '');
    const known = branches.has(branch) || /^Demo QA|^QA: add (checkout|payment|fraud) flag example/.test(title);
    if (!known) continue;

    console.log('[DeployForgeMock] closing demo PR #' + pr.number + ' (' + title + ')');
    runOptional('gh', ['pr', 'close', String(pr.number), '--repo', REPOSITORY, '--delete-branch', '--yes']);
    runOptional('gh', ['api', '--method', 'DELETE', '/repos/' + REPOSITORY + '/git/refs/heads/' + branch]);
  }

  const worktreeRoot = join(ROOT, '.runtime-worktrees', 'demo-pr-build');
  rmSync(worktreeRoot, { recursive: true, force: true });
  mkdirSync(join(ROOT, '.runtime-worktrees'), { recursive: true });

  const created = [];

  try {
    for (const spec of DEMO_PR_SPECS) {
      rmSync(worktreeRoot, { recursive: true, force: true });
      run('git', ['worktree', 'add', '--detach', worktreeRoot, 'origin/main']);

      run('git', ['-C', worktreeRoot, 'switch', '-c', spec.branch]);
      for (const [relativePath, content] of Object.entries(spec.files)) {
        if (content === null) {
          if (relativePath !== 'index.html') continue;
          addFraudIndexChange(worktreeRoot);
          continue;
        }

        const target = join(worktreeRoot, relativePath);
        mkdirSync(resolve(target, '..'), { recursive: true });
        writeFileSync(target, content, 'utf8');
      }

      run('git', ['-C', worktreeRoot, 'add', '-A']);
      run('git', ['-C', worktreeRoot, 'commit', '-m', 'QA: add ' + spec.branch.split('/').at(-1) + ' fixture']);
      run('git', ['-C', worktreeRoot, 'push', '--set-upstream', 'origin', spec.branch], { inherit: true });

      const output = run('gh', [
        'pr',
        'create',
        '--repo',
        REPOSITORY,
        '--base',
        'main',
        '--head',
        spec.branch,
        '--title',
        spec.title,
        '--body',
        spec.body,
        ...(spec.draft ? ['--draft'] : []),
      ], { inherit: true });

      created.push({ branch: spec.branch, result: output });
      run('git', ['worktree', 'remove', '--force', worktreeRoot]);
    }
  } finally {
    runOptional('git', ['worktree', 'remove', '--force', worktreeRoot]);
    rmSync(worktreeRoot, { recursive: true, force: true });
  }

  console.log('[DeployForgeMock] recreated ' + created.length + ' demo PRs.');
};

console.log('[DeployForgeMock] Starting complete local/demo reset.');
console.log('[DeployForgeMock] This reset never deletes the Git repository itself.');

await resetGoff();
await resetRuntime();
cleanGithubReleasesAndPackages();
recreateDemoPrs();

console.log('[DeployForgeMock] Complete reset finished.');
console.log('[DeployForgeMock] Main must contain {} in flags.goff.yaml; GOFF exposes that as flags=[].');
