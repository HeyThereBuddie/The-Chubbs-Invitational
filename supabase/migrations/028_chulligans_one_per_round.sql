-- Change chulligans from 1-per-nine-holes to 1-per-round.
-- The `half` column (front/back nine tracking) is no longer needed.

-- 1. Drop old unique constraint (1 per player per half)
ALTER TABLE public.chulligans
  DROP CONSTRAINT IF EXISTS chulligans_team_id_player_id_half_key;

-- 2. Deduplicate existing data: keep only the most recent record per (team, player)
DELETE FROM public.chulligans a
USING public.chulligans b
WHERE a.created_at < b.created_at
  AND a.team_id   = b.team_id
  AND a.player_id = b.player_id;

-- 3. Drop the half column
ALTER TABLE public.chulligans DROP COLUMN IF EXISTS half;

-- 4. Add new 1-per-round constraint
ALTER TABLE public.chulligans
  ADD CONSTRAINT chulligans_one_per_round UNIQUE (team_id, player_id);
