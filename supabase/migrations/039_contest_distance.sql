-- GPS-measured contest distance. For Longest Drive this is the tee→ball yardage
-- (used to rank the leaderboard); for Closest to Pin it's the ball→pin distance
-- in yards (displayed as feet/inches, kept for reference only — CTP still ranks
-- by latest submission since the pin moves daily).
alter table public.contest_entries
  add column if not exists distance_yds numeric;
