# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? |
|---|------|-------|----------|--------|-----------|------------|
| D001 | M001/S01 | process | Feature branch strategy | `feat/room-first-ux` from upstream 2f097aa | Clean slate — no prior code carried. Cherry-pick infrastructure only. | No |
| D002 | M001/S01 | arch | npm lockfile generation | Use npm 10.8.2 via `npx -y npm@10.8.2 install` | Docker node:20-alpine has npm 10.8.2. npm 11 lockfiles cause "Exit handler never called" in Docker builds. | Yes — when Docker base image upgrades npm |
| D003 | M001/S01 | arch | Docker build network | `network: host` for compose build | Docker default bridge DNS can't resolve registry.npmjs.org on this machine. | Yes — environment-specific |
| D004 | M001/S01 | arch | Dockerfile workspace node_modules | Remove per-workspace node_modules COPY | npm workspaces hoist all deps to root node_modules. Per-workspace dirs don't exist. | No |
| D005 | M001/S01 | arch | Test infrastructure source | Port from prior milestones, strip non-upstream additions | MockReadTransport, MockWriteClient, testApp are battle-tested. Stripped mqttClient (not in upstream ServerDependencies). | No |
| D006 | M001/S01 | arch | HA version pinning | Pin HA container to 2026.2 | Bootstrap script and onboarding API tested against this version. | Yes — bump when needed |
