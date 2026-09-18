# Local deployment runtime

This local-only runtime provides three physically separate deployment folders:

- environments/dev/current -> 8081
- environments/hmg/current -> 8082
- environments/prod/current -> 8083

DeployForge calls the control API on port 8090.

HMG materializes the candidate from the frozen main SHA plus exact PR head SHAs. The resulting files are stored under artifacts/ and copied into the HMG folder.

Production never rebuilds the code. It copies the already materialized artifact for the approved release. Rollback copies the previous artifact.
