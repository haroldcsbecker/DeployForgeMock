# Local deployment runtime

This local-only runtime provides three physically separate deployment folders:

- environments/dev/current -> 8081
- environments/hmg/current -> 8082
- environments/prod/current -> 8083

DeployForge calls the control API on port 8090.

## HMG

HMG receives one current artifact composed from the current main SHA plus the selected PR heads:

~~~text
Main + PR1
Main + PR1 + PR2 + ... + PRn
~~~

Changing the PR selection rebuilds the artifact. HMG does not maintain a historical artifact list.

## Production

Production receives the artifact selected by the DeployForge production flow.

GMUD can reject individual PRs from a production candidate. DeployForge then rebuilds the production candidate with the remaining PRs before the final production deployment.

Production history is owned by DeployForge, not by the mock runtime.

## Runtime feature flags

The application evaluates runtime selections through OpenFeature and GO Feature Flag. Flag configuration is external to the deployment artifact lifecycle.
