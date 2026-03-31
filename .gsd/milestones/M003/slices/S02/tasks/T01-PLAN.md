---
estimated_steps: 7
estimated_files: 1
skills_used: []
---

# T01: Recreate S02 branch from correct base (feat/multi-device-rooms)

The current `feat/multi-device-rooms--M003-S02` branch was forked from `main` (commit 2f097aa), missing all M001+M002+M003/S01 work. Must delete the bad branch, create a new one from `feat/multi-device-rooms`, and verify the room-first codebase is present.

Steps:
1. Ensure we're on `feat/multi-device-rooms` (the integration branch)
2. Delete the bad branch: `git branch -D feat/multi-device-rooms--M003-S02`
3. Create new branch: `git checkout -b feat/multi-device-rooms--M003-S02`
4. Verify room-first files exist: `frontend/src/components/canvas/types.ts` has `ActiveDrag` union, `RoomCanvas.tsx` imports from generic item system, `backend/src/` has sensors migration from S01
5. Verify `npx tsc --noEmit` baseline (note any pre-existing errors but confirm S01 backend sensors types exist)

## Inputs

- `feat/multi-device-rooms branch with 48 commits ahead of main`

## Expected Output

- `Clean feat/multi-device-rooms--M003-S02 branch based on feat/multi-device-rooms`

## Verification

git log --oneline -5 shows feat/multi-device-rooms history (M001/M002/S01 commits present). `git show feat/multi-device-rooms--M003-S02:everything-presence-mmwave-configurator/frontend/src/components/canvas/types.ts` contains ActiveDrag union type.
