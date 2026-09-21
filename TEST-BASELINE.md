# DeployForge Integration Test Base

This commit is the clean base for the DeployForge integration-test scenarios.

Base state:
- `main` is the source of truth
- previous test PRs are closed
- fresh scenario PRs are opened against `main`
- runtime environments should start from one immutable base artifact before a test

Fresh PR scenarios:
- #30 ready A
- #31 ready B
- #32 ready C
- #33 ready D
- #34 ready E
- #35 changes-requested review scenario
- #36 draft
- #37 multiple commits
- #38 intentional CI failure
- #39 conflict A
- #40 conflict B

The connected GitHub identity cannot submit `REQUEST_CHANGES` on its own PR (#35); use another reviewer for that scenario.

Base environment bootstrap:
```bash
npm run demo:start
npm run demo:bootstrap-base
```

The bootstrap creates one immutable artifact from `origin/main` and installs the same digest into DEV, HMG, and PROD.
