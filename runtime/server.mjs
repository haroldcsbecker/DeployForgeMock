import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, watch } from 'node:fs';
import { join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { createApplicationRuntime } from './app-container.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ENV_ROOT = join(ROOT, 'environments');
const ARTIFACT_ROOT = join(ROOT, 'artifacts');
const REPO = process.env.DEPLOYFORGE_MOCK_PROJECT_PATH ? resolve(process.env.DEPLOYFORGE_MOCK_PROJECT_PATH) : ROOT;
const API_PORT = Number(process.env.DEPLOYFORGE_MOCK_CONTROL_PORT ?? 8090);
const BASE_BRANCH = process.env.DEPLOYFORGE_MOCK_BASE_BRANCH ?? 'main';

const environments = {
  dev: { port: 8081, root: join(ENV_ROOT, 'dev', 'current') },
  hmg: { port: 8082, root: join(ENV_ROOT, 'hmg', 'current') },
  prod: { port: 8083, root: join(ENV_ROOT, 'prod', 'current') },
};

const ensureDirs = () => {
  mkdirSync(ARTIFACT_ROOT, { recursive: true });
  Object.values(environments).forEach(({ root }) => mkdirSync(root, { recursive: true }));
};

const digestKey = (digest) => digest.replace(/[^a-zA-Z0-9._-]/g, '_');
const artifactDir = (digest) => join(ARTIFACT_ROOT, digestKey(digest));
const manifestPath = (digest) => join(artifactDir(digest), 'deployforge-artifact.json');
const originBuildPath = join(ROOT, 'origin-build.json');
const stablePackagePath = join(ROOT, 'stable-package.json');
const strategyRuntimeCache = new Map();

const runtimeEnvironmentName = (environment) =>
  Object.entries(environments).find(([, value]) => value === environment)?.[0];

const strategyStatePath = (environmentName) =>
  join(ENV_ROOT, environmentName, 'strategy-runtime.json');

const invalidateStrategyRuntime = (environment) => {
  const environmentName = runtimeEnvironmentName(environment);
  if (!environmentName) return;
  for (const key of strategyRuntimeCache.keys()) {
    if (key.startsWith(environmentName + ':')) strategyRuntimeCache.delete(key);
  }
};

const readStrategySelections = (environmentName) => {
  const path = strategyStatePath(environmentName);
  if (!existsSync(path)) return {};
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

const writeStrategySelections = (environmentName, selections) => {
  mkdirSync(join(ENV_ROOT, environmentName), { recursive: true });
  writeFileSync(strategyStatePath(environmentName), JSON.stringify(selections, null, 2) + '\n', 'utf8');
};

const readRuntimeMetadataFor = (environmentName) => {
  const path = join(environments[environmentName].root, 'deployforge-runtime.json');
  if (!existsSync(path)) return undefined;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return value && typeof value === 'object' ? value : undefined;
  } catch {
    return undefined;
  }
};

const activeArtifactDigest = (environmentName) => {
  const metadata = readRuntimeMetadataFor(environmentName);
  return typeof metadata?.artifactDigest === 'string' ? metadata.artifactDigest : undefined;
};

const strategyRuntimeFor = async (environmentName) => {
  const artifactDigest = activeArtifactDigest(environmentName);
  if (!artifactDigest) throw new Error('No immutable artifact is active in ' + environmentName.toUpperCase());

  const key = environmentName + ':' + artifactDigest;
  const cached = strategyRuntimeCache.get(key);
  if (cached) return cached;

  const environment = environments[environmentName];
  const runtime = await createApplicationRuntime({
    environmentRoot: environment.root,
    environment: environmentName === 'prod' ? 'production' : 'hmg',
    artifactDigest,
    selections: readStrategySelections(environmentName),
  });
  strategyRuntimeCache.set(key, runtime);
  return runtime;
};

const readArtifactStrategyManifest = (artifactDigest) => {
  const path = join(artifactDir(artifactDigest), 'deployforge-strategy-manifest.json');
  if (!existsSync(path)) throw new Error('DeployStrategy manifest is not present in artifact ' + artifactDigest);
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.strategies)) {
    throw new Error('DeployStrategy manifest is invalid for artifact ' + artifactDigest);
  }
  return manifest;
};

const readOriginBuild = () => {
  if (!existsSync(originBuildPath)) return undefined;
  try {
    const value = JSON.parse(readFileSync(originBuildPath, 'utf8'));
    return value && typeof value === 'object' ? value : undefined;
  } catch {
    return undefined;
  }
};

const writeOriginBuild = (metadata) => {
  writeFileSync(originBuildPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8');
};

const runGit = (args, cwd = REPO) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();

const archiveRef = (ref, destination) => {
  mkdirSync(destination, { recursive: true });
  const archive = execFileSync('git', ['-C', REPO, 'archive', '--format=tar', ref]);
  execFileSync('tar', ['-x', '-C', destination], { input: archive });
};

const clearDirectory = (directory) => {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
};

const writeRuntimeMetadata = (directory, metadata) => {
  writeFileSync(join(directory, 'deployforge-runtime.json'), JSON.stringify(metadata, null, 2) + '\n', 'utf8');
};

const findLatestArtifact = () => {
  if (!existsSync(ARTIFACT_ROOT)) return undefined;

  let latest;
  for (const entry of readdirSync(ARTIFACT_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const manifest = join(ARTIFACT_ROOT, entry.name, 'deployforge-artifact.json');
    if (!existsSync(manifest)) continue;

    try {
      const metadata = JSON.parse(readFileSync(manifest, 'utf8'));
      if (!metadata.artifactDigest || !metadata.createdAt) continue;

      if (!latest || new Date(metadata.createdAt).getTime() > new Date(latest.createdAt).getTime()) {
        latest = metadata;
      }
    } catch {}
  }

  return latest;
};

const readHmgRuntimeMetadata = () => {
  const path = join(environments.hmg.root, 'deployforge-runtime.json');
  if (!existsSync(path)) return undefined;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return value && typeof value === 'object' ? value : undefined;
  } catch {
    return undefined;
  }
};

const resolveOriginBuild = () => readOriginBuild() ?? readHmgRuntimeMetadata() ?? findLatestArtifact();

const DEV_EXCLUDED = new Set(['.git', '.next', 'node_modules', 'environments', 'artifacts', '.runtime-worktrees']);

const syncDevProject = () => {
  // DEV always represents the latest remote main, never the local checkout.
  // Fetch first because production/QA merges happen through GitHub and may not
  // exist in the long-running local worktree yet.
  runGit(['fetch', 'origin', BASE_BRANCH, '--quiet']);
  const mainRef = 'origin/' + BASE_BRANCH;
  const mainSha = runGit(['rev-parse', mainRef]);
  const current = readRuntimeMetadataFor('dev');

  if (current?.sourceMainSha === mainSha && existsSync(join(environments.dev.root, 'index.html'))) {
    return;
  }

  installGitRef(mainRef, environments.dev, {
    environment: 'DEV',
    feature: 'Main branch',
    version: mainSha.slice(0, 12),
    build: 'origin-main-' + mainSha.slice(0, 12),
    sourceMainSha: mainSha,
    source: 'origin/main',
    synchronizedAt: new Date().toISOString(),
  });
};

const startDevSync = () => {
  let timer;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { syncDevProject(); } catch (error) {
        console.error('DEV sync failed:', error instanceof Error ? error.message : error);
      }
    }, 100);
  };

  try {
    watch(REPO, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      const path = String(filename);
      if (path.split(/[\\/]/).some((part) => DEV_EXCLUDED.has(part))) return;
      schedule();
    });
  } catch (error) {
    console.warn('Recursive DEV watch unavailable; using polling:', error instanceof Error ? error.message : error);
  }

  setInterval(() => {
    try { syncDevProject(); } catch {}
  }, 2000);
};

const installArtifact = (digest, environment, metadata) => {
  const source = artifactDir(digest);
  if (!existsSync(source)) throw new Error('Local artifact does not exist: ' + digest);
  clearDirectory(environment.root);
  cpSync(source, environment.root, { recursive: true });
  writeRuntimeMetadata(environment.root, metadata);
  invalidateStrategyRuntime(environment);
};

const installGitRef = (ref, environment, metadata) => {
  const temp = join(ROOT, '.runtime-worktrees', randomUUID());
  mkdirSync(join(ROOT, '.runtime-worktrees'), { recursive: true });

  try {
    runGit(['cat-file', '-e', ref + '^{commit}']);
    clearDirectory(temp);
    archiveRef(ref, temp);
    clearDirectory(environment.root);
    cpSync(temp, environment.root, { recursive: true });
    writeRuntimeMetadata(environment.root, metadata);
    invalidateStrategyRuntime(environment);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
};

const createCandidateArtifact = ({ candidateId, batchId, artifactDigest, repository, baseMainSha, prNumbers, prHeadShas }) => {
  const destination = artifactDir(artifactDigest);
  const existingManifest = manifestPath(artifactDigest);

  if (existsSync(existingManifest)) return JSON.parse(readFileSync(existingManifest, 'utf8'));

  const temp = join(ROOT, '.runtime-worktrees', randomUUID());
  mkdirSync(join(ROOT, '.runtime-worktrees'), { recursive: true });

  try {
    // The runtime is long-lived and DeployForge can reference a main SHA created
    // after the runtime started. Refresh origin/main before resolving the frozen SHA.
    runGit(['fetch', 'origin', BASE_BRANCH, '--quiet']);
    try {
      runGit(['cat-file', '-e', baseMainSha + '^{commit}']);
    } catch {
      throw new Error(
        'Base main commit is not available locally after fetching origin/' +
        BASE_BRANCH +
        ': ' +
        baseMainSha,
      );
    }
    runGit(['worktree', 'add', '--detach', temp, baseMainSha]);

    for (const [prId, expectedSha] of Object.entries(prHeadShas ?? {})) {
      const number = prNumbers?.find((value) => 'pr-' + value === prId) ?? Number(prId.replace(/^pr-/, ''));
      if (!Number.isInteger(number) || number <= 0) throw new Error('Cannot resolve PR number for ' + prId);

      const ref = 'refs/deployforge-demo/pr-' + number;
      runGit(['fetch', 'origin', '+refs/pull/' + number + '/head:' + ref]);

      const actualSha = runGit(['rev-parse', ref]);
      if (actualSha !== expectedSha) throw new Error('PR #' + number + ' changed from ' + expectedSha + ' to ' + actualSha);

      execFileSync('git', ['-C', temp, 'merge', '--no-ff', '--no-edit', ref], { stdio: 'pipe' });
    }

    const integrationSha = runGit(['rev-parse', 'HEAD'], temp);
    clearDirectory(destination);
    archiveRef(integrationSha, destination);

    const manifest = {
      candidateId,
      batchId,
      repository,
      baseMainSha,
      prNumbers,
      prHeadShas,
      integrationSha,
      artifactDigest,
      immutable: true,
      createdAt: new Date().toISOString(),
    };
    writeFileSync(existingManifest, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    return manifest;
  } finally {
    try { runGit(['worktree', 'remove', '--force', temp]); } catch {}
    rmSync(temp, { recursive: true, force: true });
  }
};

const createSelectiveReworkArtifact = ({
  sourceReleaseId,
  repository,
  baseMainSha,
  prNumbers,
  prHeadShas,
  excludedPrIds = [],
}) => {
  const included = prNumbers.filter((number) => !excludedPrIds.includes('pr-' + number));
  if (!included.length) throw new Error('Selective rework must retain at least one PR');
  const destination = artifactDir('pending');
  void destination;

  runGit(['fetch', 'origin', BASE_BRANCH, '--quiet']);
  runGit(['cat-file', '-e', baseMainSha + '^{commit}']);

  const rebuildId = randomUUID();
  const artifactDigest = 'sha256:' + createHash('sha256')
    .update(JSON.stringify({
      type: 'selective-rework',
      sourceReleaseId,
      repository,
      baseMainSha,
      prNumbers: included,
      prHeadShas,
      rebuildId,
    }))
    .digest('hex');
  const artifactDestination = artifactDir(artifactDigest);
  const existingManifest = manifestPath(artifactDigest);
  if (existsSync(existingManifest)) return JSON.parse(readFileSync(existingManifest, 'utf8'));

  const temp = join(ROOT, '.runtime-worktrees', randomUUID());
  mkdirSync(join(ROOT, '.runtime-worktrees'), { recursive: true });

  try {
    runGit(['worktree', 'add', '--detach', temp, baseMainSha]);

    for (const number of included) {
      const prId = 'pr-' + number;
      const expectedSha = prHeadShas[prId];
      if (!expectedSha) throw new Error('Missing frozen head SHA for PR #' + number);
      const ref = 'refs/deployforge-demo/pr-' + number;
      runGit(['fetch', 'origin', '+refs/pull/' + number + '/head:' + ref]);
      const actualSha = runGit(['rev-parse', ref]);
      if (actualSha !== expectedSha) {
        throw new Error('PR #' + number + ' changed from ' + expectedSha + ' to ' + actualSha);
      }
      execFileSync('git', ['-C', temp, 'merge', '--no-ff', '--no-edit', ref], { stdio: 'pipe' });
    }

    const integrationSha = runGit(['rev-parse', 'HEAD'], temp);
    clearDirectory(artifactDestination);
    archiveRef(integrationSha, artifactDestination);
    const manifest = {
      candidateId: undefined,
      batchId: undefined,
      sourceReleaseId,
      repository,
      baseMainSha,
      prNumbers: included,
      prHeadShas,
      excludedPrIds,
      integrationSha,
      artifactDigest,
      immutable: true,
      createdAt: new Date().toISOString(),
    };
    writeFileSync(existingManifest, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    return manifest;
  } finally {
    try { runGit(['worktree', 'remove', '--force', temp]); } catch {}
    rmSync(temp, { recursive: true, force: true });
  }
};

const json = (response, status, body) => {
  const payload = JSON.stringify(body);
  response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  response.end(payload);
};

const parseBody = async (request) => {
  let data = '';
  for await (const chunk of request) data += chunk;
  return data ? JSON.parse(data) : {};
};

const controlServer = createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/deploy/base') {
      const body = await parseBody(request);
      const repository = String(body.repository ?? REPO);
      const target = String(body.environment ?? '');
      if (!['dev', 'hmg', 'prod', 'all'].includes(target)) {
        return json(response, 400, { error: 'environment must be dev, hmg, prod or all' });
      }

      runGit(['fetch', 'origin', BASE_BRANCH, '--quiet']);
      const mainSha = String(body.mainSha ?? runGit(['rev-parse', 'origin/' + BASE_BRANCH]));
      runGit(['cat-file', '-e', mainSha + '^{commit}']);

      const artifactDigest = 'sha256:' + createHash('sha256')
        .update(JSON.stringify({ type: 'base', repository, mainSha }))
        .digest('hex');
      const destination = artifactDir(artifactDigest);
      const manifest = manifestPath(artifactDigest);

      if (!existsSync(manifest)) {
        clearDirectory(destination);
        archiveRef(mainSha, destination);
        writeFileSync(manifest, JSON.stringify({
          candidateId: undefined,
          batchId: undefined,
          repository,
          baseMainSha: mainSha,
          prNumbers: [],
          prHeadShas: {},
          integrationSha: mainSha,
          artifactDigest,
          immutable: true,
          source: 'main',
          createdAt: new Date().toISOString(),
        }, null, 2) + '\n', 'utf8');
      }

      const metadata = {
        artifactDigest,
        repository,
        mainSha,
        version: mainSha.slice(0, 12),
        build: 'base-main-' + mainSha.slice(0, 12),
        source: 'main',
        bootstrappedAt: new Date().toISOString(),
      };

      const targets = target === 'all'
        ? Object.entries(environments)
        : [[target, environments[target]]];

      for (const [name, environment] of targets) {
        installArtifact(artifactDigest, environment, {
          environment: name.toUpperCase(),
          feature: 'Base main',
          version: metadata.version,
          build: metadata.build,
          artifactDigest,
          sourceMainSha: mainSha,
          base: true,
          bootstrappedAt: metadata.bootstrappedAt,
        });
      }

      if (target === 'dev' || target === 'all') {
        writeOriginBuild({
          feature: 'Base main',
          version: metadata.version,
          build: metadata.build,
          artifactDigest,
          artifactCandidateId: undefined,
          artifactIntegrationSha: mainSha,
          originMainSha: mainSha,
          updatedAt: metadata.bootstrappedAt,
        });
      }

      return json(response, 200, {
        ok: true,
        artifactDigest,
        artifactRegistry: 'local',
        artifactRepository: repository,
        version: metadata.version,
        mainSha,
        target,
        environments: Object.fromEntries(
          targets.map(([name]) => [name, { port: environments[name].port, artifactDigest }]),
        ),
      });
    }

    if (request.method === 'POST' && request.url === '/artifact/build-base') {
      const body = await parseBody(request);
      const repository = String(body.repository ?? REPO);
      const mainSha = String(body.mainSha ?? '');
      if (!repository || !mainSha) {
        return json(response, 400, { error: 'repository and mainSha are required' });
      }

      runGit(['fetch', 'origin', BASE_BRANCH, '--quiet']);
      runGit(['cat-file', '-e', mainSha + '^{commit}']);

      const artifactDigest = 'sha256:' + createHash('sha256')
        .update(JSON.stringify({ type: 'base', repository, mainSha }))
        .digest('hex');
      const destination = artifactDir(artifactDigest);
      const manifest = manifestPath(artifactDigest);

      if (!existsSync(manifest)) {
        clearDirectory(destination);
        archiveRef(mainSha, destination);
        writeFileSync(manifest, JSON.stringify({
          candidateId: undefined,
          batchId: undefined,
          repository,
          baseMainSha: mainSha,
          prNumbers: [],
          prHeadShas: {},
          integrationSha: mainSha,
          artifactDigest,
          immutable: true,
          source: 'main',
          createdAt: new Date().toISOString(),
        }, null, 2) + '\n', 'utf8');
      }

      return json(response, 200, {
        integrationSha: mainSha,
        artifactDigest,
        artifactRegistry: 'local',
        artifactRepository: repository,
        version: mainSha.slice(0, 12),
        immutable: true,
      });
    }

    if (request.method === 'POST' && request.url === '/artifact/build') {
      const body = await parseBody(request);
      const candidateId = String(body.candidateId ?? '');
      const batchId = String(body.batchId ?? '');
      const repository = String(body.repository ?? '');
      const baseMainSha = String(body.baseMainSha ?? '');
      const prNumbers = Array.isArray(body.prNumbers) ? body.prNumbers.map(Number) : [];
      const prHeadShas = body.prHeadShas && typeof body.prHeadShas === 'object' ? body.prHeadShas : {};

      if (!candidateId || !batchId || !repository || !baseMainSha || !prNumbers.length) {
        return json(response, 400, { error: 'candidateId, batchId, repository, baseMainSha and prNumbers are required' });
      }

      const digestInput = JSON.stringify({ repository, baseMainSha, prNumbers, prHeadShas });
      const crypto = await import('node:crypto');
      const artifactDigest = 'sha256:' + crypto.createHash('sha256').update(digestInput).digest('hex');
      const manifest = createCandidateArtifact({
        candidateId,
        batchId,
        artifactDigest,
        repository,
        baseMainSha,
        prNumbers,
        prHeadShas,
      });

      return json(response, 200, {
        integrationSha: manifest.integrationSha,
        artifactDigest: manifest.artifactDigest,
        artifactRegistry: 'local',
        artifactRepository: repository,
        immutable: true,
      });
    }

    if (request.method === 'POST' && request.url === '/artifact/verify') {
      const body = await parseBody(request);
      const exists = typeof body.digest === 'string' && existsSync(manifestPath(body.digest));
      return json(response, 200, { ok: exists, exists });
    }

    if (request.method === 'POST' && request.url === '/deploy/hmg') {
      const body = await parseBody(request);
      const preservedDevDigest = activeArtifactDigest('dev');
      const preservedProdDigest = activeArtifactDigest('prod');
      const manifest = createCandidateArtifact(body);
      const originBuild = {
        feature: 'Candidate ' + manifest.candidateId,
        version: manifest.integrationSha.slice(0, 12),
        build: manifest.candidateId,
        artifactDigest: manifest.artifactDigest,
        artifactCandidateId: manifest.candidateId,
        artifactIntegrationSha: manifest.integrationSha,
        originMainSha: manifest.baseMainSha,
        updatedAt: new Date().toISOString(),
      };

      installArtifact(manifest.artifactDigest, environments.hmg, {
        environment: 'HMG',
        ...originBuild,
      });

      const currentDevDigest = activeArtifactDigest('dev');
      const currentProdDigest = activeArtifactDigest('prod');
      if (currentDevDigest !== preservedDevDigest || currentProdDigest !== preservedProdDigest) {
        throw new Error('HMG deployment violated environment isolation: DEV/PROD changed unexpectedly');
      }

      writeOriginBuild(originBuild);

      return json(response, 200, {
        deploymentId: 'hmg-' + manifest.candidateId + '-' + digestKey(manifest.artifactDigest).slice(-16),
        preservedEnvironments: {
          dev: currentDevDigest,
          prod: currentProdDigest,
        },
      });
    }

    if (request.method === 'POST' && request.url === '/deploy/hmg/reset') {
      const body = await parseBody(request);
      const mainSha = String(body.mainSha ?? '');
      const repository = String(body.repository ?? REPO);
      if (!mainSha) {
        return json(response, 400, { error: 'mainSha is required' });
      }

      runGit(['fetch', 'origin', BASE_BRANCH]);

      const artifactDigest = 'sha256:' + createHash('sha256')
        .update(JSON.stringify({ type: 'hmg-baseline', repository, mainSha }))
        .digest('hex');
      const destination = artifactDir(artifactDigest);
      const manifest = manifestPath(artifactDigest);

      if (!existsSync(manifest)) {
        clearDirectory(destination);
        archiveRef(mainSha, destination);
        writeFileSync(manifest, JSON.stringify({
          candidateId: undefined,
          batchId: undefined,
          repository,
          baseMainSha: mainSha,
          prNumbers: [],
          prHeadShas: {},
          integrationSha: mainSha,
          artifactDigest,
          immutable: true,
          createdAt: new Date().toISOString(),
        }, null, 2) + '\n', 'utf8');
      }

      const originBuild = {
        feature: 'Origin main',
        version: mainSha.slice(0, 12),
        build: 'origin-main-' + mainSha.slice(0, 12),
        artifactDigest,
        artifactCandidateId: undefined,
        artifactIntegrationSha: mainSha,
        originMainSha: mainSha,
        updatedAt: new Date().toISOString(),
      };

      installArtifact(artifactDigest, environments.hmg, {
        environment: 'HMG',
        ...originBuild,
        reset: true,
        resetAt: new Date().toISOString(),
      });
      writeOriginBuild(originBuild);

      return json(response, 200, {
        deploymentId: 'hmg-reset-' + mainSha.slice(0, 12),
        mainSha,
        artifactDigest,
        artifactRegistry: 'local',
        artifactRepository: repository,
        version: mainSha.slice(0, 12),
      });
    }

    if (request.method === 'POST' && request.url === '/deploy/hmg/restore') {
      const body = await parseBody(request);
      const artifactDigest = String(body.artifactDigest ?? '');
      const releaseId = String(body.releaseId ?? '');
      if (!artifactDigest || !existsSync(manifestPath(artifactDigest))) {
        return json(response, 409, { error: 'Artifact has not been materialized locally' });
      }
      const manifest = JSON.parse(readFileSync(manifestPath(artifactDigest), 'utf8'));
      installArtifact(artifactDigest, environments.hmg, {
        environment: 'HMG',
        feature: 'Restore release ' + releaseId,
        version: manifest.integrationSha.slice(0, 12),
        build: 'restore-' + releaseId,
        artifactDigest,
        artifactReleaseId: releaseId,
        restoredAt: new Date().toISOString(),
      });
      return json(response, 200, {
        deploymentId: 'hmg-restore-' + releaseId + '-' + digestKey(artifactDigest).slice(-12),
        artifactDigest,
      });
    }

    if (request.method === 'POST' && request.url === '/deploy/hmg/remove') {
      clearDirectory(environments.hmg.root);
      return json(response, 200, { ok: true, removed: true });
    }

    if (request.method === 'POST' && request.url === '/artifact/rebuild-selective') {
      const body = await parseBody(request);
      const sourceReleaseId = String(body.sourceReleaseId ?? '');
      const repository = String(body.repository ?? REPO);
      const baseMainSha = String(body.baseMainSha ?? '');
      const prNumbers = Array.isArray(body.prNumbers) ? body.prNumbers.map(Number).filter(Number.isInteger) : [];
      const prHeadShas = body.prHeadShas && typeof body.prHeadShas === 'object' ? body.prHeadShas : {};
      const excludedPrIds = Array.isArray(body.excludedPrIds) ? body.excludedPrIds.map(String) : [];
      if (!sourceReleaseId || !repository || !baseMainSha || !prNumbers.length) {
        return json(response, 400, { error: 'sourceReleaseId, repository, baseMainSha and prNumbers are required' });
      }

      const manifest = createSelectiveReworkArtifact({
        sourceReleaseId,
        repository,
        baseMainSha,
        prNumbers,
        prHeadShas,
        excludedPrIds,
      });

      installArtifact(manifest.artifactDigest, environments.hmg, {
        environment: 'HMG',
        feature: 'Selective rework ' + sourceReleaseId,
        version: manifest.integrationSha.slice(0, 12),
        build: 'selective-rework-' + sourceReleaseId,
        artifactDigest: manifest.artifactDigest,
        artifactReleaseId: sourceReleaseId,
        excludedPrIds,
        rebuiltAt: new Date().toISOString(),
      });

      return json(response, 200, {
        artifactDigest: manifest.artifactDigest,
        artifactRegistry: 'local',
        artifactRepository: repository,
        version: manifest.integrationSha.slice(0, 12) + '-selective',
        integrationSha: manifest.integrationSha,
        excludedPrIds,
      });
    }

    if (request.method === 'POST' && request.url === '/artifact/rebuild-historical') {
      const body = await parseBody(request);
      const sourceSha = String(body.sourceSha ?? '');
      const sourceReleaseId = String(body.sourceReleaseId ?? '');
      const repository = String(body.repository ?? REPO);
      if (!sourceSha || !sourceReleaseId || !repository) {
        return json(response, 400, { error: 'sourceSha, sourceReleaseId and repository are required' });
      }

      runGit(['fetch', 'origin', BASE_BRANCH, '--quiet']);
      runGit(['cat-file', '-e', sourceSha + '^{commit}']);

      const rebuildId = randomUUID();
      const artifactDigest = 'sha256:' + createHash('sha256')
        .update(JSON.stringify({ type: 'historical-rebuild', sourceReleaseId, sourceSha, repository, rebuildId }))
        .digest('hex');
      const destination = artifactDir(artifactDigest);
      const manifest = manifestPath(artifactDigest);

      clearDirectory(destination);
      archiveRef(sourceSha, destination);
      writeFileSync(manifest, JSON.stringify({
        candidateId: undefined,
        batchId: undefined,
        sourceReleaseId,
        repository,
        sourceSha,
        prNumbers: [],
        prHeadShas: {},
        integrationSha: sourceSha,
        artifactDigest,
        immutable: true,
        createdAt: new Date().toISOString(),
      }, null, 2) + '\n', 'utf8');

      installArtifact(artifactDigest, environments.hmg, {
        environment: 'HMG',
        feature: 'Rebuild release ' + sourceReleaseId,
        version: sourceSha.slice(0, 12),
        build: 'rebuild-' + sourceReleaseId + '-' + rebuildId.slice(0, 8),
        artifactDigest,
        artifactReleaseId: sourceReleaseId,
        rebuiltAt: new Date().toISOString(),
      });

      return json(response, 200, {
        artifactDigest,
        artifactRegistry: 'local',
        artifactRepository: repository,
        version: sourceSha.slice(0, 12) + '-rebuild-' + rebuildId.slice(0, 8),
        integrationSha: sourceSha,
      });
    }

    if (request.method === 'GET' && request.url === '/deployforge-strategy-runtime.json') {
      const environmentName = runtimeEnvironmentName(environment);
      const artifactDigest = activeArtifactDigest(environmentName);
      if (!artifactDigest) {
        return json(response, 404, { error: 'No immutable artifact is active in this environment' });
      }

      const manifest = readArtifactStrategyManifest(artifactDigest);
      const persisted = readStrategySelections(environmentName);
      const strategies = manifest.strategies.map((strategy) => ({
        id: strategy.id,
        selectedImplementation: persisted[strategy.id] ?? strategy.defaultImplementation,
        availableImplementationIds: strategy.implementations,
        defaultImplementation: strategy.defaultImplementation,
      }));

      return json(response, 200, {
        environment: environmentName,
        artifactDigest,
        strategies,
      });
    }

    if (request.method === 'POST' && request.url === '/strategies/manifest') {
      const body = await parseBody(request);
      const environment = body.environment === 'hmg' ? 'hmg' : body.environment === 'production' ? 'prod' : undefined;
      if (!environment) return json(response, 400, { error: 'environment must be hmg or production' });

      const currentDigest = activeArtifactDigest(environment);
      const requestedDigest = typeof body.artifactDigest === 'string' ? body.artifactDigest : currentDigest;
      if (!requestedDigest) return json(response, 409, { error: 'No immutable artifact is active in the requested environment' });
      if (requestedDigest !== currentDigest && !existsSync(manifestPath(requestedDigest))) {
        return json(response, 409, { error: 'Requested artifact is not materialized locally' });
      }

      const manifest = readArtifactStrategyManifest(requestedDigest);
      const active = requestedDigest === currentDigest;
      const runtime = active ? await strategyRuntimeFor(environment) : undefined;

      return json(response, 200, {
        environment: body.environment,
        artifactDigest: requestedDigest,
        manifest,
        selections: runtime?.deployStrategy.selections() ?? {},
      });
    }

    if (request.method === 'POST' && request.url === '/strategies/switch') {
      const body = await parseBody(request);
      const environment = body.environment === 'hmg' ? 'hmg' : body.environment === 'production' ? 'prod' : undefined;
      const strategyId = typeof body.strategyId === 'string' ? body.strategyId.trim() : '';
      const implementationId = typeof body.implementationId === 'string' ? body.implementationId.trim() : '';
      const artifactDigest = typeof body.artifactDigest === 'string' ? body.artifactDigest : '';

      if (!environment || !strategyId || !implementationId || !artifactDigest) {
        return json(response, 400, { error: 'environment, strategyId, implementationId and artifactDigest are required' });
      }

      const activeDigest = activeArtifactDigest(environment);
      if (artifactDigest !== activeDigest) {
        return json(response, 409, {
          error: 'Active ' + environment.toUpperCase() + ' artifact changed; refresh DeployForge before changing the strategy',
          activeArtifactDigest: activeDigest,
        });
      }

      const runtime = await strategyRuntimeFor(environment);
      const result = await runtime.deployStrategy.switchTo(runtime.container, strategyId, implementationId, {
        environment: body.environment,
        artifactDigest,
        actor: typeof body.actor === 'string' ? body.actor : 'deployforge',
      });
      writeStrategySelections(environment, runtime.deployStrategy.selections());

      const order = runtime.container.resolve('orderService').checkout();
      return json(response, 200, {
        environment: body.environment,
        artifactDigest,
        ...result,
        selections: runtime.deployStrategy.selections(),
        order,
      });
    }

    if (request.method === 'POST' && request.url === '/strategies/compensate') {
      const body = await parseBody(request);
      const environment = body.environment === 'hmg' ? 'hmg' : body.environment === 'production' ? 'prod' : undefined;
      const strategyId = typeof body.strategyId === 'string' ? body.strategyId.trim() : '';
      const implementationId = typeof body.implementationId === 'string' ? body.implementationId.trim() : '';
      const artifactDigest = typeof body.artifactDigest === 'string' ? body.artifactDigest : '';

      if (!environment || !strategyId || !implementationId || !artifactDigest) {
        return json(response, 400, { error: 'environment, strategyId, implementationId and artifactDigest are required' });
      }

      const activeDigest = activeArtifactDigest(environment);
      if (artifactDigest !== activeDigest) {
        return json(response, 409, { error: 'Active artifact changed; refresh DeployForge before compensating the strategy' });
      }

      const runtime = await strategyRuntimeFor(environment);
      const result = await runtime.deployStrategy.compensate(strategyId, implementationId, {
        environment: body.environment,
        artifactDigest,
        actor: typeof body.actor === 'string' ? body.actor : 'deployforge',
      });
      return json(response, 200, result);
    }

    if (request.method === 'POST' && request.url === '/hmg/ready') {
      const body = await parseBody(request);
      const healthy = existsSync(join(environments.hmg.root, 'deployforge-runtime.json'));
      return json(response, healthy ? 200 : 409, { ok: healthy, deploymentId: String(body.deploymentId ?? ''), healthy });
    }

    if (request.method === 'POST' && request.url === '/package/stable') {
      const body = await parseBody(request);
      const packageName = String(body.packageName ?? '');
      const stableTag = String(body.stableTag ?? 'stable');
      const version = String(body.version ?? '');
      const releaseId = String(body.releaseId ?? '');
      const candidateId = String(body.candidateId ?? '');
      const artifactDigest = String(body.artifactDigest ?? '');

      if (!packageName || !releaseId || !candidateId || !artifactDigest || !existsSync(manifestPath(artifactDigest))) {
        return json(response, 400, { error: 'packageName, releaseId, candidateId and an existing artifactDigest are required' });
      }

      const stablePackage = {
        packageName,
        stableTag,
        version,
        releaseId,
        candidateId,
        artifactDigest,
        updatedAt: new Date().toISOString(),
      };

      writeFileSync(stablePackagePath, JSON.stringify(stablePackage, null, 2) + '\n', 'utf8');

      return json(response, 200, {
        ok: true,
        stablePackage,
      });
    }

    if (request.method === 'POST' && request.url === '/deploy/prod') {
      const body = await parseBody(request);
      if (typeof body.artifactDigest !== 'string' || !existsSync(manifestPath(body.artifactDigest))) {
        return json(response, 409, { error: 'Artifact has not been materialized locally' });
      }

      const preservedDevDigest = activeArtifactDigest('dev');
      const preservedHmgDigest = activeArtifactDigest('hmg');
      const manifest = JSON.parse(readFileSync(manifestPath(body.artifactDigest), 'utf8'));
      const releaseBuild = body.rollbackOfReleaseId
        ? 'rollback-' + String(body.releaseId).replace(/^release-/, '')
        : 'release-' + String(body.candidateId).replace(/^candidate-/, '');

      installArtifact(body.artifactDigest, environments.prod, {
        environment: 'PROD',
        feature: body.rollbackOfReleaseId ? 'Rollback ' + releaseBuild : 'Release ' + releaseBuild,
        version: manifest.integrationSha.slice(0, 12),
        build: releaseBuild,
        artifactDigest: body.artifactDigest,
      });

      const currentDevDigest = activeArtifactDigest('dev');
      const currentHmgDigest = activeArtifactDigest('hmg');
      if (currentDevDigest !== preservedDevDigest || currentHmgDigest !== preservedHmgDigest) {
        throw new Error('Production deployment violated environment isolation: DEV/HMG changed unexpectedly');
      }

      return json(response, 200, {
        deploymentId: 'prod-' + body.releaseId + '-' + digestKey(body.artifactDigest).slice(-16),
        preservedEnvironments: {
          dev: currentDevDigest,
          hmg: currentHmgDigest,
        },
      });
    }



    if (request.method === 'POST' && request.url === '/prod/health') {
      const body = await parseBody(request);
      const healthy = existsSync(join(environments.prod.root, 'deployforge-runtime.json'));
      return json(response, 200, { ok: true, healthy, releaseId: body.releaseId });
    }

    return json(response, 404, { error: 'Not found' });
  } catch (error) {
    return json(response, 500, { error: error instanceof Error ? error.message : 'Unknown runtime error' });
  }
});

const staticServer = (environment, port) => createServer((request, response) => {
  try {
    const pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);

    if (request.method === 'GET' && pathname === '/deployforge-strategy-runtime.json') {
      const environmentName = runtimeEnvironmentName(environment);
      const artifactDigest = activeArtifactDigest(environmentName);
      if (!artifactDigest) {
        json(response, 404, { error: 'No immutable artifact is active in this environment' });
        return;
      }

      const manifest = readArtifactStrategyManifest(artifactDigest);
      const persisted = readStrategySelections(environmentName);
      const strategies = manifest.strategies.map((strategy) => ({
        id: strategy.id,
        selectedImplementation: persisted[strategy.id] ?? strategy.defaultImplementation,
        availableImplementationIds: strategy.implementations,
        defaultImplementation: strategy.defaultImplementation,
      }));

      json(response, 200, {
        environment: environmentName,
        artifactDigest,
        strategies,
      });
      return;
    }

    const requested = pathname === '/' ? '/index.html' : pathname;
    const file = resolve(environment.root, '.' + normalize(requested));
    const relativePath = relative(environment.root, file);

    if (relativePath.startsWith('..') || relativePath.includes('..' + '/')) {
      response.writeHead(403); response.end('Forbidden'); return;
    }

    if (!existsSync(file)) {
      response.writeHead(404); response.end('Not found'); return;
    }

    const extension = file.split('.').pop();
    const types = {
      html: 'text/html; charset=utf-8',
      css: 'text/css; charset=utf-8',
      json: 'application/json; charset=utf-8',
      js: 'text/javascript; charset=utf-8',
      svg: 'image/svg+xml',
    };

    response.writeHead(200, { 'Content-Type': types[extension] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  } catch {
    response.writeHead(500); response.end('Runtime error');
  }
});

ensureDirs();
runGit(['fetch', 'origin', BASE_BRANCH]);

syncDevProject();
startDevSync();

for (const [name, environment] of Object.entries(environments)) {
  if (name !== 'dev' && !existsSync(join(environment.root, 'index.html'))) {
    clearDirectory(environment.root);
    archiveRef('origin/' + BASE_BRANCH, environment.root);
    const startupMainSha = runGit(['rev-parse', 'origin/' + BASE_BRANCH]);
    const startupArtifactDigest = 'sha256:' + createHash('sha256')
      .update(JSON.stringify({ type: 'base', repository: REPO, mainSha: startupMainSha }))
      .digest('hex');
    writeRuntimeMetadata(environment.root, {
      environment: name.toUpperCase(),
      feature: name === 'hmg' ? 'Main branch' : 'Last production baseline',
      version: startupMainSha.slice(0, 12),
      build: 'main',
      artifactDigest: startupArtifactDigest,
      sourceMainSha: startupMainSha,
    });
  }
}

Object.entries(environments).forEach(([name, environment]) => {
  staticServer(environment, environment.port).listen(environment.port, '127.0.0.1', () => {
    console.log(name.toUpperCase() + ' app: http://localhost:' + environment.port);
  });
});

controlServer.listen(API_PORT, '127.0.0.1', () => {
  console.log('DeployForge mock control API: http://localhost:' + API_PORT);
  console.log('DeployForgeMock project: ' + REPO);
});
