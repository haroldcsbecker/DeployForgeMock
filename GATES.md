# Gates: safe local reset

OWNS: runtime/server.mjs, scripts/verify-reset-artifacts.mjs

- [ ] G1: the HMG reset clears generated local artifacts before recreating BASE
  CHECK: node scripts/verify-reset-artifacts.mjs
  EXPECT: local artifact reset verification passed
  EVIDENCE: pending

- [ ] G2: the demo reset never deletes the DEV/project checkout
  CHECK: node scripts/verify-reset-artifacts.mjs
  EXPECT: reset contains no repository-wide cleanup and no DEV_ROOT/REPO cleanup
  EVIDENCE: pending

- [ ] G3: reset startup state can only restore BASE after a reset
  CHECK: inspect reset ordering in runtime/server.mjs
  EXPECT: artifact store is cleared before BASE manifest materialization
  EVIDENCE: pending
