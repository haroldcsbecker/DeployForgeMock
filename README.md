# Deploy Forge Mock

A deliberately small deployment target used to demonstrate the DeployForge workflow.

The application has almost no business logic. Its purpose is to make deployment state visible.

## Environments

- `hmg/` — shared homologation configuration used by QA.
- `prod/` — production configuration used after approval.

The two configurations are intentionally tiny. DeployForge can treat the built image as the immutable candidate while these directories document the environment-specific deployment settings.

## Demo UI

The page displays:

- environment;
- feature name;
- application version;
- build identifier;
- a simple counter.

The environment changes the page background:

- HMG → teal;
- PROD → blue.

The page also accepts query parameters so a deployment can inject visible metadata without changing the application code:

```
/?env=HMG&feature=Counter%20v2&version=1.1.0&build=candidate-123
```

## Run locally

```bash
npm test
docker build -t deployforge-mock .
docker run --rm -p 8080:80 deployforge-mock
```

Then open:

```
http://localhost:8080/?env=HMG&feature=Candidate%20demo&version=1.0.0&build=local
```

## DeployForge showcase

A simple demonstration can change only one visible feature in a PR, for example:

- counter behavior;
- background/environment styling;
- visible feature label.

That PR can then travel through:

```
PR
  ↓
Batch
  ↓
Candidate
  ↓
HMG
  ↓
QA approval
  ↓
Merge
  ↓
Production
  ↓
Rollback
```

The repository is intentionally simple so that the deployment mechanics remain the thing being demonstrated.


## Physical local environments

Run the three separated application folders and the local deployment API:

\`\`\`bash
npm install
npm run demo:start
\`\`\`

This starts:

- DEV: http://localhost:8081
- HMG: http://localhost:8082
- PROD: http://localhost:8083
- deployment API: http://localhost:8090

Generated files are physically separated:

\`\`\`
environments/
  dev/current/
  hmg/current/
  prod/current/

artifacts/
  <artifact-digest>/
\`\`\`

DEV is refreshed from the latest \`origin/main\` when the runtime starts. HMG is initially a base-branch snapshot and is replaced by the composed candidate when DeployForge calls the HMG deployment endpoint. When QA rejects an HMG candidate, DeployForge calls `/deploy/hmg/reset` with the batch's frozen base-branch SHA so the physical HMG directory is restored before another candidate is promoted. PROD is initially a base-branch snapshot and changes only when DeployForge calls the production deployment endpoint.

The local runtime uses the frozen batch data supplied by DeployForge. HMG fetches each exact PR head, verifies the SHA, merges the PRs in batch order on top of the frozen base-branch SHA, stores the resulting files as a local immutable artifact, and copies that artifact into \`environments/hmg/current/\`.

Production copies the same materialized artifact into \`environments/prod/current/\`; it does not rebuild it. Rollback copies the previous materialized artifact.

## Connect DeployForge

In the DeployForge \`.env.local\`, use the physical runtime:

\`\`\`env
DEPLOYFORGE_ADAPTER_MODE=mock

ARTIFACT_VERIFY_URL=http://127.0.0.1:8090/artifact/verify
HMG_DEPLOY_URL=http://127.0.0.1:8090/deploy/hmg
HMG_READY_URL=http://127.0.0.1:8090/hmg/ready
PRODUCTION_DEPLOY_URL=http://127.0.0.1:8090/deploy/prod
PRODUCTION_HEALTH_URL=http://127.0.0.1:8090/prod/health
STABLE_PACKAGE_PROMOTE_URL=http://127.0.0.1:8090/package/stable
\`\`\`

Keep the normal GitHub App and MongoDB settings. The deployment runtime uses the local DeployForgeMock checkout and its Git remote. Set `DEPLOYFORGE_MOCK_BASE_BRANCH=master` when the target repository uses `master` instead of `main`.

For the local demo, keep the three QA eligibility gates disabled:

\`\`\`env
DEPLOYFORGE_REQUIRE_GITHUB_REVIEW=false
DEPLOYFORGE_REQUIRE_PIPELINE=false
DEPLOYFORGE_REQUIRE_SINGLE_COMMIT=false
\`\`\`
