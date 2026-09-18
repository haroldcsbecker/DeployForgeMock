# DeployForge Mock

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
