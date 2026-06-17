-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║   THE CHUBBS MEMORIAL — DEMO DATA                                    ║
-- ║   Run in Supabase SQL Editor (service role).                         ║
-- ║   Safe to run multiple times — fully idempotent.                     ║
-- ║   Evan's real account is placed on Team 1. Everyone else is fake.    ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- HOLE PARS: [5,4,5,3,4,4,3,4,4 | 4,4,4,3,5,4,3,5,4]  total = 72
-- FORMAT: scramble best ball

DO $$
DECLARE
  v_tid  uuid;   -- active tournament id
  v_evan uuid;   -- real user (evankosmidis@gmail.com)

  -- ── 19 fictional player UUIDs ─────────────────────────────────────────
  p1  uuid := '11000000-0000-0000-0000-000000000001'; -- Matt Henderson
  p2  uuid := '11000000-0000-0000-0000-000000000002'; -- Happy Gilmore
  p3  uuid := '11000000-0000-0000-0000-000000000003'; -- Shooter McGavin
  p4  uuid := '11000000-0000-0000-0000-000000000004'; -- Chubbs Peterson
  p5  uuid := '11000000-0000-0000-0000-000000000005'; -- Doug Thompson
  p6  uuid := '11000000-0000-0000-0000-000000000006'; -- Billy Madison
  p7  uuid := '11000000-0000-0000-0000-000000000007'; -- Mike Chen
  p8  uuid := '11000000-0000-0000-0000-000000000008'; -- Tommy McGee
  p9  uuid := '11000000-0000-0000-0000-000000000009'; -- Craig Nelson
  p10 uuid := '11000000-0000-0000-0000-000000000010'; -- Farley Holt
  p11 uuid := '11000000-0000-0000-0000-000000000011'; -- Jake Morrison
  p12 uuid := '11000000-0000-0000-0000-000000000012'; -- Tom Burke
  p13 uuid := '11000000-0000-0000-0000-000000000013'; -- Dave Walsh
  p14 uuid := '11000000-0000-0000-0000-000000000014'; -- Nick Patterson
  p15 uuid := '11000000-0000-0000-0000-000000000015'; -- Chris Larson
  p16 uuid := '11000000-0000-0000-0000-000000000016'; -- Lee Trevino
  p17 uuid := '11000000-0000-0000-0000-000000000017'; -- Otto Yarbrough
  p18 uuid := '11000000-0000-0000-0000-000000000018'; -- Virginia Venit
  p19 uuid := '11000000-0000-0000-0000-000000000019'; -- Bob Barker

  -- ── 10 team UUIDs ────────────────────────────────────────────────────
  t1  uuid := '22000000-0000-0000-0000-000000000001'; -- The Challengers (Evan + Matt)
  t2  uuid := '22000000-0000-0000-0000-000000000002'; -- Gilmore & McGavin
  t3  uuid := '22000000-0000-0000-0000-000000000003'; -- Big Easy
  t4  uuid := '22000000-0000-0000-0000-000000000004'; -- The Classics
  t5  uuid := '22000000-0000-0000-0000-000000000005'; -- Ice & Fire
  t6  uuid := '22000000-0000-0000-0000-000000000006'; -- The Mulligans
  t7  uuid := '22000000-0000-0000-0000-000000000007'; -- Eagle Chasers
  t8  uuid := '22000000-0000-0000-0000-000000000008'; -- Cart Crashers
  t9  uuid := '22000000-0000-0000-0000-000000000009'; -- Sunday Drivers
  t10 uuid := '22000000-0000-0000-0000-000000000010'; -- Barker & Venit

BEGIN

  -- ── 0. Resolve active tournament ─────────────────────────────────────
  SELECT id INTO v_tid FROM public.tournaments WHERE status = 'active' LIMIT 1;
  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'No active tournament. Create one in the Admin panel first.';
  END IF;

  UPDATE public.tournaments SET
    name       = 'The Chubbs Memorial 2026',
    course     = 'Pebble Creek Golf Club',
    date       = CURRENT_DATE,
    player_cap = 20,
    notes      = 'Annual charity scramble. Bring sunscreen and your best impression of Happy Gilmore.'
  WHERE id = v_tid;

  -- ── 1. Resolve Evan's real account ───────────────────────────────────
  SELECT id INTO v_evan FROM public.profiles
    WHERE email = 'evankosmidis@gmail.com' LIMIT 1;

  IF v_evan IS NULL THEN
    -- Fall back to oldest real account that isn't a demo user
    SELECT id INTO v_evan FROM public.profiles
      WHERE id::text NOT LIKE '11000000-%'
      ORDER BY joined_at LIMIT 1;
  END IF;

  -- Upgrade Evan's display details for the demo
  IF v_evan IS NOT NULL THEN
    UPDATE public.profiles SET
      nickname = 'The Commissioner',
      handicap = 10,
      status   = 'active'
    WHERE id = v_evan;
  END IF;

  -- ── 2. Auth stubs for fictional players (no password → can't log in) ─
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    created_at, updated_at, is_super_admin, is_sso_user,
    confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_confirm_status
  ) VALUES
    ('00000000-0000-0000-0000-000000000000', p1,  'authenticated','authenticated','matt.henderson@demo.golf',  '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'90d'::interval,now()-'90d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p2,  'authenticated','authenticated','happy.gilmore@demo.golf',   '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'85d'::interval,now()-'85d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p3,  'authenticated','authenticated','shooter.mcgavin@demo.golf', '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'84d'::interval,now()-'84d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p4,  'authenticated','authenticated','chubbs.peterson@demo.golf', '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'83d'::interval,now()-'83d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p5,  'authenticated','authenticated','doug.thompson@demo.golf',   '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'82d'::interval,now()-'82d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p6,  'authenticated','authenticated','billy.madison@demo.golf',   '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'80d'::interval,now()-'80d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p7,  'authenticated','authenticated','mike.chen@demo.golf',       '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'79d'::interval,now()-'79d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p8,  'authenticated','authenticated','tommy.mcgee@demo.golf',     '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'78d'::interval,now()-'78d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p9,  'authenticated','authenticated','craig.nelson@demo.golf',    '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'77d'::interval,now()-'77d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p10, 'authenticated','authenticated','farley.holt@demo.golf',     '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'76d'::interval,now()-'76d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p11, 'authenticated','authenticated','jake.morrison@demo.golf',   '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'75d'::interval,now()-'75d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p12, 'authenticated','authenticated','tom.burke@demo.golf',       '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'74d'::interval,now()-'74d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p13, 'authenticated','authenticated','dave.walsh@demo.golf',      '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'73d'::interval,now()-'73d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p14, 'authenticated','authenticated','nick.patterson@demo.golf',  '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'72d'::interval,now()-'72d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p15, 'authenticated','authenticated','chris.larson@demo.golf',    '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'71d'::interval,now()-'71d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p16, 'authenticated','authenticated','lee.trevino@demo.golf',     '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'70d'::interval,now()-'70d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p17, 'authenticated','authenticated','otto.yarbrough@demo.golf',  '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'69d'::interval,now()-'69d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p18, 'authenticated','authenticated','virginia.venit@demo.golf',  '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'68d'::interval,now()-'68d'::interval,false,false,'','','','',0),
    ('00000000-0000-0000-0000-000000000000', p19, 'authenticated','authenticated','bob.barker@demo.golf',      '',now(),'{}','{"provider":"email","providers":["email"]}',now()-'67d'::interval,now()-'67d'::interval,false,false,'','','','',0)
  ON CONFLICT (id) DO NOTHING;

  -- ── 3. Fictional profiles ─────────────────────────────────────────────
  INSERT INTO public.profiles (id, name, nickname, email, role, status, handicap, phone, joined_at) VALUES
    (p1,  'Matt Henderson',  'Matty Ice',      'matt.henderson@demo.golf',  'player','active',  8, '555-0101', now()-'90d'::interval),
    (p2,  'Happy Gilmore',   'The Sandlapper', 'happy.gilmore@demo.golf',   'player','active', 28, '555-0102', now()-'85d'::interval),
    (p3,  'Shooter McGavin', 'Shooter',        'shooter.mcgavin@demo.golf', 'player','active',  5, '555-0103', now()-'84d'::interval),
    (p4,  'Chubbs Peterson', 'Chubbs',         'chubbs.peterson@demo.golf', 'player','active',  4, '555-0104', now()-'83d'::interval),
    (p5,  'Doug Thompson',   'Dougie Fresh',   'doug.thompson@demo.golf',   'player','active', 18, '555-0105', now()-'82d'::interval),
    (p6,  'Billy Madison',   null,             'billy.madison@demo.golf',   'player','active', 24, '555-0106', now()-'80d'::interval),
    (p7,  'Mike Chen',       'The Dragon',     'mike.chen@demo.golf',       'player','active', 12, '555-0107', now()-'79d'::interval),
    (p8,  'Tommy McGee',     'T-Mac',          'tommy.mcgee@demo.golf',     'player','active', 10, '555-0108', now()-'78d'::interval),
    (p9,  'Craig Nelson',    'Nellie',         'craig.nelson@demo.golf',    'player','active',  7, '555-0109', now()-'77d'::interval),
    (p10, 'Farley Holt',     'Big Farley',     'farley.holt@demo.golf',     'player','active', 16, '555-0110', now()-'76d'::interval),
    (p11, 'Jake Morrison',   'Morri',          'jake.morrison@demo.golf',   'player','active', 19, '555-0111', now()-'75d'::interval),
    (p12, 'Tom Burke',       'Burkey',         'tom.burke@demo.golf',       'player','active', 13, '555-0112', now()-'74d'::interval),
    (p13, 'Dave Walsh',      'Walshy',         'dave.walsh@demo.golf',      'player','active', 21, '555-0113', now()-'73d'::interval),
    (p14, 'Nick Patterson',  'Patto',          'nick.patterson@demo.golf',  'player','active', 11, '555-0114', now()-'72d'::interval),
    (p15, 'Chris Larson',    'Larsy',          'chris.larson@demo.golf',    'player','active', 17, '555-0115', now()-'71d'::interval),
    (p16, 'Lee Trevino',     null,             'lee.trevino@demo.golf',     'player','active',  6, '555-0116', now()-'70d'::interval),
    (p17, 'Otto Yarbrough',  null,             'otto.yarbrough@demo.golf',  'player','active', 14, '555-0117', now()-'69d'::interval),
    (p18, 'Virginia Venit',  'Ginny',          'virginia.venit@demo.golf',  'player','active', 20, '555-0118', now()-'68d'::interval),
    (p19, 'Bob Barker',      'Bobby B',        'bob.barker@demo.golf',      'player','active',  8, '555-0119', now()-'67d'::interval)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, nickname = EXCLUDED.nickname, status = EXCLUDED.status,
    handicap = EXCLUDED.handicap, phone = EXCLUDED.phone;

  -- ── 4. Teams (tournament-scoped) ─────────────────────────────────────
  INSERT INTO public.teams (id, name, p1_id, p2_id, tournament_id) VALUES
    (t1,  'The Challengers',  COALESCE(v_evan, p1), p1,  v_tid),
    (t2,  'Gilmore & McGavin',p2,  p3,  v_tid),
    (t3,  'Big Easy',         p4,  p5,  v_tid),
    (t4,  'The Classics',     p6,  p7,  v_tid),
    (t5,  'Ice & Fire',       p8,  p9,  v_tid),
    (t6,  'The Mulligans',    p10, p11, v_tid),
    (t7,  'Eagle Chasers',    p12, p13, v_tid),
    (t8,  'Cart Crashers',    p14, p15, v_tid),
    (t9,  'Sunday Drivers',   p16, p17, v_tid),
    (t10, 'Barker & Venit',   p18, p19, v_tid)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, p1_id = EXCLUDED.p1_id, p2_id = EXCLUDED.p2_id,
    tournament_id = EXCLUDED.tournament_id;

  -- Handle t1 when Evan exists — avoid assigning him to p1 slot
  IF v_evan IS NOT NULL THEN
    UPDATE public.teams SET p1_id = v_evan, p2_id = p1 WHERE id = t1;
  END IF;

  -- ── 5. Sync profiles.team_id ──────────────────────────────────────────
  UPDATE public.profiles SET team_id = t1  WHERE id IN (p1, COALESCE(v_evan, p1));
  UPDATE public.profiles SET team_id = t2  WHERE id IN (p2,  p3);
  UPDATE public.profiles SET team_id = t3  WHERE id IN (p4,  p5);
  UPDATE public.profiles SET team_id = t4  WHERE id IN (p6,  p7);
  UPDATE public.profiles SET team_id = t5  WHERE id IN (p8,  p9);
  UPDATE public.profiles SET team_id = t6  WHERE id IN (p10, p11);
  UPDATE public.profiles SET team_id = t7  WHERE id IN (p12, p13);
  UPDATE public.profiles SET team_id = t8  WHERE id IN (p14, p15);
  UPDATE public.profiles SET team_id = t9  WHERE id IN (p16, p17);
  UPDATE public.profiles SET team_id = t10 WHERE id IN (p18, p19);
  IF v_evan IS NOT NULL THEN
    UPDATE public.profiles SET team_id = t1 WHERE id = v_evan;
  END IF;

  -- ── 6. Tee times ─────────────────────────────────────────────────────
  DELETE FROM public.tee_times WHERE team_id IN (t1,t2,t3,t4,t5,t6,t7,t8,t9,t10);
  INSERT INTO public.tee_times (team_id, tee_time, starting_hole, cart, notes) VALUES
    (t1,  '08:00:00', 1,  'Cart 1',  null),
    (t2,  '08:00:00', 10, 'Cart 2',  null),
    (t3,  '08:10:00', 1,  'Cart 3',  null),
    (t4,  '08:10:00', 10, 'Cart 4',  null),
    (t5,  '08:20:00', 1,  'Cart 5',  null),
    (t6,  '08:20:00', 10, 'Cart 6',  null),
    (t7,  '08:30:00', 1,  'Cart 7',  null),
    (t8,  '08:30:00', 10, 'Cart 8',  null),
    (t9,  '08:40:00', 1,  'Cart 9',  'Haven''t teed off yet'),
    (t10, '08:40:00', 10, 'Cart 10', 'Haven''t teed off yet');

  -- ── 7. Scores ─────────────────────────────────────────────────────────
  -- Par: [5,4,5,3,4,4,3,4,4 | 4,4,4,3,5,4,3,5,4] = 72

  -- t1 The Challengers (Evan + Matt) — -4 through 14 holes (in contention)
  DELETE FROM public.scores WHERE team_id = t1;
  INSERT INTO public.scores (team_id, hole, score, drive_used_id) VALUES
    (t1, 1,  4, COALESCE(v_evan,p1)), -- par 5  → birdie
    (t1, 2,  3, p1),                  -- par 4  → birdie
    (t1, 3,  4, COALESCE(v_evan,p1)), -- par 5  → birdie
    (t1, 4,  3, p1),                  -- par 3  → par
    (t1, 5,  3, COALESCE(v_evan,p1)), -- par 4  → birdie
    (t1, 6,  3, p1),                  -- par 4  → birdie
    (t1, 7,  3, COALESCE(v_evan,p1)), -- par 3  → par
    (t1, 8,  4, p1),                  -- par 4  → par
    (t1, 9,  4, COALESCE(v_evan,p1)), -- par 4  → par
    (t1,10,  4, p1),                  -- par 4  → par
    (t1,11,  5, COALESCE(v_evan,p1)), -- par 4  → bogey
    (t1,12,  4, p1),                  -- par 4  → par
    (t1,13,  3, COALESCE(v_evan,p1)), -- par 3  → par
    (t1,14,  5, p1);                  -- par 5  → par

  -- t2 Gilmore & McGavin — -7 through 18 (LEADERS)
  DELETE FROM public.scores WHERE team_id = t2;
  INSERT INTO public.scores (team_id, hole, score, drive_used_id) VALUES
    (t2, 1,  4, p2),(t2, 2,  4, p3),(t2, 3,  4, p2),
    (t2, 4,  2, p3),(t2, 5,  3, p2),(t2, 6,  3, p3),
    (t2, 7,  3, p2),(t2, 8,  4, p3),(t2, 9,  4, p2),
    (t2,10,  4, p3),(t2,11,  4, p2),(t2,12,  4, p3),
    (t2,13,  3, p2),(t2,14,  4, p3),(t2,15,  4, p2),
    (t2,16,  3, p3),(t2,17,  4, p2),(t2,18,  4, p3);
  -- Front: 4+4+4+2+3+3+3+4+4=31(-5) Back: 4+4+4+3+4+4+3+4+4=34(-2) Total=65(-7)

  -- t3 Big Easy — -6 through 18 (2nd place)
  DELETE FROM public.scores WHERE team_id = t3;
  INSERT INTO public.scores (team_id, hole, score, drive_used_id) VALUES
    (t3, 1,  4, p4),(t3, 2,  4, p5),(t3, 3,  4, p4),
    (t3, 4,  2, p5),(t3, 5,  3, p4),(t3, 6,  3, p5),
    (t3, 7,  3, p4),(t3, 8,  4, p5),(t3, 9,  4, p4),
    (t3,10,  4, p5),(t3,11,  5, p4),(t3,12,  4, p5),
    (t3,13,  3, p4),(t3,14,  4, p5),(t3,15,  4, p4),
    (t3,16,  3, p5),(t3,17,  4, p4),(t3,18,  4, p5);
  -- Front: 4+4+4+2+3+3+3+4+4=31(-5) Back: 4+5+4+3+4+4+3+4+4=35(-1) Total=66(-6)

  -- t4 The Classics — -5 through 18 (3rd place)
  DELETE FROM public.scores WHERE team_id = t4;
  INSERT INTO public.scores (team_id, hole, score, drive_used_id) VALUES
    (t4, 1,  4, p6),(t4, 2,  4, p7),(t4, 3,  4, p6),
    (t4, 4,  3, p7),(t4, 5,  3, p6),(t4, 6,  3, p7),
    (t4, 7,  3, p6),(t4, 8,  4, p7),(t4, 9,  4, p6),
    (t4,10,  4, p7),(t4,11,  4, p6),(t4,12,  4, p7),
    (t4,13,  3, p6),(t4,14,  4, p7),(t4,15,  4, p6),
    (t4,16,  3, p7),(t4,17,  5, p6),(t4,18,  4, p7);
  -- Front: 4+4+4+3+3+3+3+4+4=32(-4) Back: 4+4+4+3+4+4+3+5+4=35(-1) Total=67(-5)

  -- t5 Ice & Fire — -3 through 15 (in contention)
  DELETE FROM public.scores WHERE team_id = t5;
  INSERT INTO public.scores (team_id, hole, score, drive_used_id) VALUES
    (t5, 1,  4, p8),(t5, 2,  4, p9),(t5, 3,  4, p8),
    (t5, 4,  3, p9),(t5, 5,  3, p8),(t5, 6,  3, p9),
    (t5, 7,  3, p8),(t5, 8,  5, p9),(t5, 9,  4, p8),
    (t5,10,  4, p9),(t5,11,  4, p8),(t5,12,  4, p9),
    (t5,13,  3, p8),(t5,14,  5, p9),(t5,15,  4, p8);
  -- Front: 4+4+4+3+3+3+3+5+4=33(-3) Back thru15: 4+4+4+3+5+4=24(E vs par24) Total=-3

  -- t6 The Mulligans — -2 through 16
  DELETE FROM public.scores WHERE team_id = t6;
  INSERT INTO public.scores (team_id, hole, score, drive_used_id) VALUES
    (t6, 1,  5, p10),(t6, 2,  4, p11),(t6, 3,  5, p10),
    (t6, 4,  3, p11),(t6, 5,  4, p10),(t6, 6,  3, p11),
    (t6, 7,  3, p10),(t6, 8,  5, p11),(t6, 9,  4, p10),
    (t6,10,  4, p11),(t6,11,  3, p10),(t6,12,  4, p11),
    (t6,13,  2, p10),(t6,14,  5, p11),(t6,15,  4, p10),
    (t6,16,  3, p11);
  -- Front: 5+4+5+3+4+3+3+5+4=36(E) Back thru16: 4+3+4+2+5+4+3=25(-2 vs par27) Total=-2

  -- t7 Eagle Chasers — -1 through 18
  DELETE FROM public.scores WHERE team_id = t7;
  INSERT INTO public.scores (team_id, hole, score, drive_used_id) VALUES
    (t7, 1,  5, p12),(t7, 2,  3, p13),(t7, 3,  5, p12),
    (t7, 4,  3, p13),(t7, 5,  4, p12),(t7, 6,  3, p13),
    (t7, 7,  3, p12),(t7, 8,  5, p13),(t7, 9,  4, p12),
    (t7,10,  4, p13),(t7,11,  4, p12),(t7,12,  4, p13),
    (t7,13,  3, p12),(t7,14,  5, p13),(t7,15,  4, p12),
    (t7,16,  3, p13),(t7,17,  5, p12),(t7,18,  4, p13);
  -- Front: 5+3+5+3+4+3+3+5+4=35(-1) Back: 4+4+4+3+5+4+3+5+4=36(E) Total=71(-1)

  -- t8 Cart Crashers — E through 18
  DELETE FROM public.scores WHERE team_id = t8;
  INSERT INTO public.scores (team_id, hole, score, drive_used_id) VALUES
    (t8, 1,  5, p14),(t8, 2,  4, p15),(t8, 3,  5, p14),
    (t8, 4,  3, p15),(t8, 5,  4, p14),(t8, 6,  4, p15),
    (t8, 7,  3, p14),(t8, 8,  4, p15),(t8, 9,  4, p14),
    (t8,10,  4, p15),(t8,11,  4, p14),(t8,12,  4, p15),
    (t8,13,  3, p14),(t8,14,  5, p15),(t8,15,  4, p14),
    (t8,16,  3, p15),(t8,17,  5, p14),(t8,18,  4, p15);
  -- Front: 5+4+5+3+4+4+3+4+4=36(E) Back: 4+4+4+3+5+4+3+5+4=36(E) Total=72(E)

  -- t9 Sunday Drivers — +3 through 12 (struggling)
  DELETE FROM public.scores WHERE team_id = t9;
  INSERT INTO public.scores (team_id, hole, score, drive_used_id) VALUES
    (t9, 1,  5, p16),(t9, 2,  4, p17),(t9, 3,  5, p16),
    (t9, 4,  3, p17),(t9, 5,  4, p16),(t9, 6,  4, p17),
    (t9, 7,  3, p16),(t9, 8,  5, p17),(t9, 9,  4, p16),
    (t9,10,  5, p17),(t9,11,  5, p16),(t9,12,  5, p17);
  -- Front: 5+4+5+3+4+4+3+5+4=37(+1) Back thru12: 5+5+5=15(+3 vs par12) Total=+4

  -- t10 Barker & Venit — no scores (haven't started back 9 yet after lunch detour)

  -- ── 8. Chulligans ─────────────────────────────────────────────────────
  -- One per player per round allowed
  DELETE FROM public.chulligans WHERE team_id IN (t1,t2,t3,t4,t5,t6,t7,t8,t9,t10);
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='chulligans' AND column_name='half') THEN
    -- Older schema: half column still present (migration 028 not yet applied)
    INSERT INTO public.chulligans (team_id, player_id, half, hole) VALUES
      (t2,  p2,  'front', 3),
      (t3,  p5,  'front', 7),
      (t5,  p8,  'front', 8),
      (t7,  p13, 'front', 2),
      (t9,  p16, 'front', 6)
    ON CONFLICT DO NOTHING;
  ELSE
    -- Newer schema: half column dropped (migration 028 applied)
    INSERT INTO public.chulligans (team_id, player_id, hole) VALUES
      (t2,  p2,  3),
      (t3,  p5,  7),
      (t5,  p8,  8),
      (t7,  p13, 2),
      (t9,  p16, 6)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── 9. Contest entries ────────────────────────────────────────────────
  DELETE FROM public.contest_entries WHERE tournament_id = v_tid;
  INSERT INTO public.contest_entries (type, player_id, hole, distance, photo_url, tournament_id) VALUES
    -- CTP Hole 3 (par 3)
    ('ctp', p4,              3, '3 ft 8 in',
     'https://images.unsplash.com/photo-1560719887-fe3105fa1e55?w=800&q=80', v_tid),
    ('ctp', p9,              3, '11 ft 4 in', null, v_tid),
    ('ctp', COALESCE(v_evan,p1), 3, '18 ft 2 in', null, v_tid),
    -- CTP Hole 7 (par 3)
    ('ctp', p12, 7, '6 ft 1 in',
     'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=800&q=80', v_tid),
    ('ctp', p3,  7, '9 ft 7 in',  null, v_tid),
    -- LD Hole 1 (par 5)
    ('ld',  p4,  1, '318 yards',
     'https://images.unsplash.com/photo-1622547748225-3fc4abd2cca0?w=800&q=80', v_tid),
    ('ld',  p3,  1, '304 yards',  null, v_tid),
    ('ld',  p16, 1, '291 yards',  null, v_tid),
    -- LD Hole 5 (par 4)
    ('ld',  p2,  5, '267 yards',
     'https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=800&q=80', v_tid),
    ('ld',  p8,  5, '249 yards',  null, v_tid);

  -- ── 10. Jackass voting ───────────────────────────────────────────────
  DELETE FROM public.leahey_votes WHERE tournament_id = v_tid;
  -- Billy Madison is winning the jackass award with 6 votes
  INSERT INTO public.leahey_votes (voter_id, nominee_id, tournament_id) VALUES
    (p2,  p6, v_tid), (p3,  p6, v_tid), (p4,  p6, v_tid),
    (p5,  p6, v_tid), (p8,  p6, v_tid), (p12, p6, v_tid),
    -- A few votes for Dave Walsh as runner-up
    (p9,  p13, v_tid), (p10, p13, v_tid),
    -- Evan voted (if he exists)
    (COALESCE(v_evan, p1), p6, v_tid);

  -- Open Jackass voting
  INSERT INTO public.tournament_settings (id, lahey_voting_open) VALUES (1, true)
  ON CONFLICT (id) DO UPDATE SET lahey_voting_open = true;

  -- ── 11. Photos — Happy's Place ────────────────────────────────────────
  DELETE FROM public.photos WHERE tournament_id = v_tid;
  INSERT INTO public.photos (uploader_id, photo_url, caption, tournament_id, created_at) VALUES
    (p4,  'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800&q=80',
     'First tee vibes ⛳ Let''s get it', v_tid, now()-'4h30m'::interval),
    (p2,  'https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=800&q=80',
     'Hole 2 — pure contact 🏌️', v_tid, now()-'4h'::interval),
    (p3,  'https://images.unsplash.com/photo-1622547748225-3fc4abd2cca0?w=800&q=80',
     'Shooter''s drive on 1. 304 yards. NBD.', v_tid, now()-'3h50m'::interval),
    (p12, 'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=800&q=80',
     'CTP on 7 — 6 ft 1 in baby 📍', v_tid, now()-'3h30m'::interval),
    (p9,  'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=800&q=80',
     'View from the 9th green 🌅 this course is UNREAL', v_tid, now()-'2h45m'::interval),
    (p5,  'https://images.unsplash.com/photo-1561982001-3bd6a046b2b6?w=800&q=80',
     'Dougie fresh on the back 9 😤', v_tid, now()-'2h15m'::interval),
    (COALESCE(v_evan, p1),
     'https://images.unsplash.com/photo-1504890566-4dc80a1bbccb?w=800&q=80',
     'Birdie on 5. The boys are rolling 🔥', v_tid, now()-'1h45m'::interval),
    (p8,  'https://images.unsplash.com/photo-1534216153226-b54483f4b833?w=800&q=80',
     'T-Mac said "hold my beer" on hole 8 😂', v_tid, now()-'1h'::interval),
    (p6,  'https://images.unsplash.com/photo-1626379961798-53ce4cfbd9c0?w=800&q=80',
     'Billy Madison does NOT know what he''s doing out here', v_tid, now()-'30m'::interval),
    (p16, 'https://images.unsplash.com/photo-1542621334-a254cf47733d?w=800&q=80',
     '19th hole can''t come soon enough', v_tid, now()-'10m'::interval);

  -- ── 12. Live feed events ──────────────────────────────────────────────
  DELETE FROM public.feed_events WHERE tournament_id = v_tid;
  INSERT INTO public.feed_events (event_type, team_id, team_name, player_name, hole, score, label, emoji, tournament_id, created_at) VALUES
    ('score',    t3,  'Big Easy',          'Chubbs Peterson',  4, 2, 'Eagle',           '🦅', v_tid, now()-'4h20m'::interval),
    ('score',    t2,  'Gilmore & McGavin', 'Happy Gilmore',    4, 2, 'Eagle',           '🦅', v_tid, now()-'4h15m'::interval),
    ('score',    t1,  'The Challengers',   'The Challengers',  1, 4, 'Birdie',          '🐦', v_tid, now()-'4h10m'::interval),
    ('score',    t4,  'The Classics',      'The Classics',     5, 3, 'Birdie',          '🐦', v_tid, now()-'3h55m'::interval),
    ('chulligan',t2,  'Gilmore & McGavin', 'Happy Gilmore',    3, null,'Chulligan Used','🐊', v_tid, now()-'3h40m'::interval),
    ('score',    t3,  'Big Easy',          'Big Easy',         6, 3, 'Birdie',          '🐦', v_tid, now()-'3h30m'::interval),
    ('contest',  null,'',                  'Chubbs Peterson',  3, null,'CTP — 3 ft 8 in! 📍','📍',v_tid, now()-'3h20m'::interval),
    ('score',    t1,  'The Challengers',   'The Challengers',  5, 3, 'Birdie',          '🐦', v_tid, now()-'3h00m'::interval),
    ('score',    t2,  'Gilmore & McGavin', 'Gilmore & McGavin',7, 3, 'Birdie',          '🐦', v_tid, now()-'2h50m'::interval),
    ('contest',  null,'',                  'Chubbs Peterson',  1, null,'LD — 318 yards 💥','💥',v_tid, now()-'2h40m'::interval),
    ('score',    t5,  'Ice & Fire',        'Ice & Fire',       7, 3, 'Birdie',          '🐦', v_tid, now()-'2h20m'::interval),
    ('chulligan',t3,  'Big Easy',          'Doug Thompson',    7, null,'Chulligan Used', '🐊', v_tid, now()-'2h10m'::interval),
    ('score',    t6,  'The Mulligans',     'The Mulligans',   13, 2, 'Birdie',          '🐦', v_tid, now()-'1h50m'::interval),
    ('contest',  null,'',                  'Tom Burke',        7, null,'CTP — 6 ft 1 in! 📍','📍',v_tid, now()-'1h30m'::interval),
    ('score',    t1,  'The Challengers',   'The Challengers',  6, 3, 'Birdie',          '🐦', v_tid, now()-'1h15m'::interval),
    ('score',    t7,  'Eagle Chasers',     'Eagle Chasers',    4, 3, 'Birdie',          '🐦', v_tid, now()-'1h00m'::interval),
    ('score',    t2,  'Gilmore & McGavin', 'Gilmore & McGavin',16,3, 'Birdie',          '🐦', v_tid, now()-'45m'::interval),
    ('score',    t5,  'Ice & Fire',        'Ice & Fire',       13,3, 'Birdie',          '🐦', v_tid, now()-'30m'::interval),
    ('score',    t3,  'Big Easy',          'Big Easy',         16,3, 'Birdie',          '🐦', v_tid, now()-'20m'::interval),
    ('score',    t4,  'The Classics',      'The Classics',     16,3, 'Birdie',          '🐦', v_tid, now()-'10m'::interval);

  -- ── 13. Announcements ────────────────────────────────────────────────
  DELETE FROM public.updates WHERE id IN (
    '33000000-0000-0000-0000-000000000001',
    '33000000-0000-0000-0000-000000000002',
    '33000000-0000-0000-0000-000000000003'
  );
  INSERT INTO public.updates (id, title, body, pinned, created_by) VALUES
    (
      '33000000-0000-0000-0000-000000000001',
      'Welcome to The Chubbs Memorial 2026! ⛳',
      E'Welcome, golfers! The day is finally here — it''s all in the hips.\n\nShotgun start at 8:00 AM sharp. Best ball scramble format — take the best score between you and your partner on each hole. Track your scores in the app as you play.\n\nOne chulligan per player per round. Use it wisely.\n\nGood luck and may Chubbs be with you. 🏌️',
      true,
      COALESCE(v_evan, p1)
    ),
    (
      '33000000-0000-0000-0000-000000000002',
      '📍 Contest Holes — CTP & LD',
      E'Closest to Pin: Holes 3 and 7 (both par 3s).\nLongest Drive: Holes 1 and 5.\n\nSubmit your entry immediately after your shot in the Contests tab. CTP requires a photo. LD is on the honour system (we''re watching you, Shooter).',
      false,
      COALESCE(v_evan, p1)
    ),
    (
      '33000000-0000-0000-0000-000000000003',
      '🤠 Jackass Voting Is Open',
      E'Who''s the Jackass of the Day? Voting is open in the Contests tab. Results announced at the 19th hole dinner.\n\nCurrent frontrunner has been noted. You know who you are, Billy.',
      false,
      COALESCE(v_evan, p1)
    );

  -- ── 14. Foursomes (score approval pairings) ──────────────────────────
  DELETE FROM public.foursomes
    WHERE team_a_id IN (t1,t2,t3,t4,t5,t6,t7,t8,t9,t10)
       OR team_b_id IN (t1,t2,t3,t4,t5,t6,t7,t8,t9,t10);
  INSERT INTO public.foursomes (team_a_id, team_b_id) VALUES
    (t1, t2), (t3, t4), (t5, t6), (t7, t8), (t9, t10);

  RAISE NOTICE E'✅ Demo data loaded!\n   Tournament: % (%)\n   10 teams · 20 players\n   Real user on Team 1: %',
    (SELECT name FROM public.tournaments WHERE id = v_tid),
    v_tid,
    COALESCE((SELECT email FROM public.profiles WHERE id = v_evan), 'not found — used p1 as placeholder');

END;
$$;
