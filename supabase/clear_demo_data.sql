-- ============================================================
-- Clear Demo Data — The Chubbs Invitational
-- Removes all demo/test data while keeping real registered
-- accounts and tournament announcements.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

BEGIN;

-- Score approvals (references scores — delete first)
DELETE FROM public.score_approvals;

-- Foursomes (references teams)
DELETE FROM public.foursomes;

-- Chulligans
DELETE FROM public.chulligans;

-- Scores
DELETE FROM public.scores;

-- Tee times
DELETE FROM public.tee_times;

-- Pairings
DELETE FROM public.pairings;

-- Contest entries
DELETE FROM public.contest_entries;

-- Lahey votes
DELETE FROM public.leahey_votes;

-- Unlink all profiles from teams before deleting teams
UPDATE public.profiles SET team_id = NULL;

-- All teams (real + demo — admin recreates real ones before tournament day)
DELETE FROM public.teams;

-- Demo profiles only (identified by @demo.golf email or known demo UUID prefixes)
DELETE FROM public.profiles
WHERE email LIKE '%@demo.golf'
   OR id::text LIKE '11000000-%'
   OR id::text LIKE 'a1000000-%';

-- Demo auth users (same criteria — keeps real registered auth accounts)
DELETE FROM auth.users
WHERE email LIKE '%@demo.golf'
   OR id::text LIKE '11000000-%'
   OR id::text LIKE 'a1000000-%';

COMMIT;

-- Verify: should show only real registered accounts
SELECT id, name, email, role, status FROM public.profiles ORDER BY joined_at;
