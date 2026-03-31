---
estimated_steps: 13
estimated_files: 3
skills_used: []
---

# T01: Add aggregationMode to Zone types and wire through parseZone

Add the `aggregationMode` field to Zone types in both backend and frontend so zones can carry their aggregation strategy. Update the rooms router parseZone to preserve the field through normalization. This is a small foundational change that unblocks T02 and T03.

## Steps

1. **Backend types** (`backend/src/domain/types.ts`): Import `AggregationMode` from `../ha/templateGenerator`. Add `aggregationMode?: AggregationMode` to both `ZoneRect` and `ZonePolygon` interfaces.

2. **Frontend types** (`frontend/src/api/types.ts`): Add `aggregationMode?: 'or' | 'majority' | 'no_change_on_tie'` to both `ZoneRect` and `ZonePolygon` interfaces. Do NOT import from backend — duplicate the literal union type to keep frontend self-contained.

3. **parseZone in rooms router** (`backend/src/routes/rooms.ts`): In the `parseZone` function, extract `aggregationMode` from the input, validate it against the three valid values (`'or'`, `'majority'`, `'no_change_on_tie'`), and include it on the returned zone object. Invalid/missing values should be omitted (will default to `'or'` at template generation time in T02).

4. **Type check both sides**:
   - `cd backend && npx tsc --noEmit` — 0 new errors from S04 files
   - `cd frontend && npx tsc --noEmit` — 0 new errors from S04 files

## Must-Haves

- [ ] `aggregationMode?: AggregationMode` on `ZoneRect` and `ZonePolygon` in backend types
- [ ] `aggregationMode?: 'or' | 'majority' | 'no_change_on_tie'` on `ZoneRect` and `ZonePolygon` in frontend types
- [ ] `parseZone` preserves valid `aggregationMode` values, omits invalid ones
- [ ] Both `tsc --noEmit` checks pass with 0 new errors

## Inputs

- ``everything-presence-mmwave-configurator/backend/src/domain/types.ts` — existing ZoneRect and ZonePolygon interfaces to extend`
- ``everything-presence-mmwave-configurator/frontend/src/api/types.ts` — existing frontend Zone types to extend`
- ``everything-presence-mmwave-configurator/backend/src/routes/rooms.ts` — parseZone function that normalizes zone data from HTTP request bodies`
- ``everything-presence-mmwave-configurator/backend/src/ha/templateGenerator.ts` — AggregationMode type to import`

## Expected Output

- ``everything-presence-mmwave-configurator/backend/src/domain/types.ts` — ZoneRect and ZonePolygon with aggregationMode field`
- ``everything-presence-mmwave-configurator/frontend/src/api/types.ts` — ZoneRect and ZonePolygon with aggregationMode field`
- ``everything-presence-mmwave-configurator/backend/src/routes/rooms.ts` — parseZone preserves aggregationMode`

## Verification

cd everything-presence-mmwave-configurator/backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit
