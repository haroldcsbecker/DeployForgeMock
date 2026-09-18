import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ENV_ROOT = join(ROOT, 'environments');
const ARTIFACT_ROOT = join(ROOT, 'artifacts');
const REPO = process.env.DEPLOYFORGE_MOCK_PROJECT_PATH ? resolve(process.env.DEPLOYFORGE_MOCK_PROJECT_PATH) : ROOT;
const API_PORT = Number(process.env.DEPLOYFORGE_MOCK_CONTROL_PORT ?? 8090);

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

const installArtifact = (digest, environment, metadata) => {
  const source = artifactDir(digest);
  if (!existsSync(source)) throw new Error('Local artifact does not exist: ' + digest);
  clearDirectory(environment.root);
  cpSync(source, environment.root, { recursive: true });
  writeRuntimeMetadata(environment.root, metadata);
};

const createCandidateArtifact = ({ candidateId, batchId, artifactDigest, repository, baseMainSha, prNumbers, prHeadShas }) => {
  const destination = artifactDir(artifactDigest);
  const existingManifest = manifestPath(artifactDigest);

  if (existsSync(existingManifest)) return JSON.parse(readFileSync(existingManifest, 'utf8'));

  const temp = join(ROOT, '.runtime-worktrees', randomUUID());
  mkdirSync(join(ROOT, '.runtime-worktrees'), { recursive: true });

  try {
    runGit(['worktree', 'add', '--detach', temp, baseMainSha]);

    for (const [prId, expectedSha] of Object.entries(prHeadShas ?? {})) {
      const number = prNumbers?.find((value) => 'pr-' + value === prId) ?? Number(prId.replace(/^pr-/, ''));
      if (!Number.isInteger(number) || number <= 0) throw new Error('Cannot resolve PR number for ' + prId);

      const ref = 'refs/deployforge-demo/pr-' + number;
      runGit(['fetch', 'origin', 'refs/pull/' + number + '/head:' + ref]);

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
    if (request.method === 'POST' && request.url === '/artifact/verify') {
      const body = await parseBody(request);
      const exists = typeof body.digest === 'string' && existsSync(manifestPath(body.digest));
      return json(response, 200, { ok: exists, exists });
    }

    if (request.method === 'POST' && request.url === '/deploy/hmg') {
      const body = await parseBody(request);
      const manifest = createCandidateArtifact(body);
      installArtifact(manifest.artifactDigest, environments.hmg, {
        environment: 'HMG',
        feature: 'Candidate ' + manifest.candidateId,
        version: manifest.integrationSha.slice(0, 12),
        build: manifest.candidateId,
        artifactDigest: manifest.artifactDigest,
      });
      return json(response, 200, { deploymentId: 'hmg-' + manifest.candidateId + '-' + digestKey(manifest.artifactDigest).slice(-16) });
    }

    if (request.method === 'POST' && request.url === '/hmg/ready') {
      const body = await parseBody(request);
      const healthy = existsSync(join(environments.hmg.root, 'deployforge-runtime.json'));
      return json(response, healthy ? 200 : 409, { ok: healthy, deploymentId: String(body.deploymentId ?? ''), healthy });
    }

    if (request.method === 'POST' && request.url === '/deploy/prod') {
      const body = await parseBody(request);
      if (typeof body.artifactDigest !== 'string' || !existsSync(manifestPath(body.artifactDigest))) {
        return json(response, 409, { error: 'Artifact has not been materialized locally' });
      }

      const manifest = JSON.parse(readFileSync(manifestPath(body.artifactDigest), 'utf8'));
      installArtifact(body.artifactDigest, environments.prod, {
        environment: 'PROD',
        feature: body.rollbackOfReleaseId ? 'Rollback ' + body.releaseId : 'Release ' + body.releaseId,
        version: manifest.integrationSha.slice(0, 12),
        build: body.rollbackOfReleaseId ? 'rollback-' + body.rollbackOfReleaseId : body.releaseId,
        artifactDigest: body.artifactDigest,
      });
      return json(response, 200, { deploymentId: 'prod-' + body.releaseId + '-' + digestKey(body.artifactDigest).slice(-16) });
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
runGit(['fetch', 'origin', 'main']);

clearDirectory(environments.dev.root);
archiveRef('origin/main', environments.dev.root);
writeRuntimeMetadata(environments.dev.root, {
  environment: 'DEV',
  feature: 'Main branch',
  version: runGit(['rev-parse', 'origin/main']).slice(0, 12),
  build: 'main',
});

for (const [name, environment] of Object.entries(environments)) {
  if (name !== 'dev' && !existsSync(join(environment.root, 'index.html'))) {
    clearDirectory(environment.root);
    archiveRef('origin/main', environment.root);
    writeRuntimeMetadata(environment.root, {
      environment: name.toUpperCase(),
      feature: name === 'hmg' ? 'Main branch' : 'Last production baseline',
      version: runGit(['rev-parse', 'origin/main']).slice(0, 12),
      build: 'main',
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
