# DeployForge Feature Flags — Image Flow Reference

Use this document as the source description for a flow-diagram image. The diagram should show **one Feature Flag with multiple implementations**, the **immutable artifact boundary**, and the fact that **HMG and Production are independent environment states**.

## Core flow

```
                         ┌─────────────────────────────┐
                         │ Feature Flag definition     │
                         │                             │
                         │ payment-processor           │
                         │ implementations:            │
                         │   legacy                     │
                         │   new                        │
                         │   canary                     │
                         │ default: legacy              │
                         └──────────────┬──────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────┐
                         │ Git project                  │
                         │ DeployForgeMock              │
                         │ runtime/strategies/...       │
                         └──────────────┬──────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────┐
                         │ Immutable artifact            │
                         │ sha256:<digest>               │
                         │ carries the manifest          │
                         └──────────────┬──────────────┘
                                        │
                     ┌──────────────────┴──────────────────┐
                     │                                     │
                     ▼                                     ▼
          ┌─────────────────────┐               ┌─────────────────────┐
          │ HMG                 │               │ Production          │
          │                     │               │                     │
          │ artifact A          │               │ artifact B          │
          │ flag = canary       │               │ flag = legacy       │
          │                     │               │                     │
          │ QA validation       │               │ production control  │
          └──────────┬──────────┘               └──────────┬──────────┘
                     │                                     │
                     │ switch only HMG                     │ switch only PROD
                     ▼                                     ▼
          ┌─────────────────────┐               ┌─────────────────────┐
          │ Runtime             │               │ Runtime             │
          │ reads exact         │               │ reads exact         │
          │ artifact + flag     │               │ artifact + flag     │
          └─────────────────────┘               └─────────────────────┘
```

## Environment isolation

The most important visual rule is:

```
                    SAME FEATURE FLAG
                           │
            ┌──────────────┴──────────────┐
            │                             │
            ▼                             ▼
         HMG state                   PROD state
         independent                independent

       canary selected              legacy selected
       artifact A                   artifact B
            │                             │
            └──────────────┬──────────────┘
                           │
                  NO implicit propagation
```

Changing a flag in HMG does not change Production. Changing a flag in Production does not change HMG.

## Artifact-bound implementation rule

A flag action is allowed only when the implementation exists in the **currently active immutable artifact**.

```
User selects implementation
           │
           ▼
   Is flag present?
      /         \
    NO           YES
    │             │
    ▼             ▼
 BLOCK         Is implementation
 action        in artifact manifest?
                  /       \
                NO         YES
                │           │
                ▼           ▼
              BLOCK      validate
                           │
                           ▼
                         switch
```

A missing flag or missing implementation must never be fabricated by the control plane.

## Multiple versions of one flag

Example:

```
Feature Flag: payment-processor

┌─────────┬────────────────────────────────────────────┐
│ legacy  │ old payment implementation                 │
├─────────┼────────────────────────────────────────────┤
│ new     │ current replacement                        │
├─────────┼────────────────────────────────────────────┤
│ canary  │ third implementation for controlled testing│
└─────────┴────────────────────────────────────────────┘

HMG        → canary
Production → new
```

The same flag can therefore have different selected implementations in different environments.

## Rollback and compensation

The image should separate **compensation** from **artifact rollback**:

```
                 Rollback requested
                        │
             ┌──────────┴──────────┐
             │                     │
             ▼                     ▼
      Compensation needed?     Target artifact
             │                     │
             ▼                     ▼
      run implementation      restore exact
      compensation handler     immutable digest
             │                     │
             └──────────┬──────────┘
                        ▼
                 target artifact
                 becomes active
                        │
                        ▼
              feature flag state is
              reconciled to target
              artifact's manifest
```

For the BASE artifact, the path is an emergency recovery path: the base artifact is immutable, is not blocked by the normal HMG lock, and feature-flag selections are reset to the BASE manifest defaults.

## Responsibility boundaries

```
HMG tab
├─ show flags present in HMG
├─ switch HMG implementation
├─ show rollback/compensation behavior
└─ HMG-only rollback / emergency BASE

Production tab
├─ show flags present in Production
├─ switch Production implementation
├─ show rollback/compensation behavior
└─ Production-only rollback / emergency BASE

Shared information
├─ Git project
├─ source path
├─ flag description
├─ implementation descriptions
└─ active immutable artifact digest
```

## Suggested image composition

For an image, use five visual areas from left to right:

1. **Flag definition** — name, description, and 2–3 implementation versions.
2. **Git project** — source file and manifest.
3. **Immutable artifact** — SHA-256 digest as the boundary.
4. **HMG** — selected implementation and QA responsibility.
5. **Production** — selected implementation and production responsibility.

Add a clear separation line between HMG and Production and show that each side can select a different implementation from the same flag.

Use the words **Feature Flag**, **Implementation**, **Immutable Artifact**, **HMG**, **Production**, **Compensation**, and **Rollback** in the diagram.


## BASE artifact generation

A BASE rebuild is tied to the current `main` commit. The baseline workflow publishes `ghcr.io/haroldcsbecker/deployforgemock:base-main` and the `base-main` GitHub Release from that same `main` SHA. The BASE artifact is the root used for emergency rollback and baseline restart.
