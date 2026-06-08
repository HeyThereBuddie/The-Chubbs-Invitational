-- ============================================================
-- The Chubbs Invitational — Demo Data (20 players / 10 teams)
-- Run AFTER migration 005_unify_profiles.sql
-- Safe to run multiple times (idempotent).
--
-- Real registered accounts are discovered dynamically and placed
-- together as Team 1. The remaining 18 spots are fictional players.
-- Real accounts are NEVER overwritten.
-- ============================================================

DO $$
DECLARE
  -- Real accounts (discovered dynamically, never modified)
  real_p1          uuid;
  real_p2          uuid;
  real_team_name   text;

  -- 18 fictional player UUIDs
  p1  uuid := '11000000-0000-0000-0000-000000000001';
  p2  uuid := '11000000-0000-0000-0000-000000000002';
  p3  uuid := '11000000-0000-0000-0000-000000000003';
  p4  uuid := '11000000-0000-0000-0000-000000000004';
  p5  uuid := '11000000-0000-0000-0000-000000000005';
  p6  uuid := '11000000-0000-0000-0000-000000000006';
  p7  uuid := '11000000-0000-0000-0000-000000000007';
  p8  uuid := '11000000-0000-0000-0000-000000000008';
  p9  uuid := '11000000-0000-0000-0000-000000000009';
  p10 uuid := '11000000-0000-0000-0000-000000000010';
  p11 uuid := '11000000-0000-0000-0000-000000000011';
  p12 uuid := '11000000-0000-0000-0000-000000000012';
  p13 uuid := '11000000-0000-0000-0000-000000000013';
  p14 uuid := '11000000-0000-0000-0000-000000000014';
  p15 uuid := '11000000-0000-0000-0000-000000000015';
  p16 uuid := '11000000-0000-0000-0000-000000000016';
  p17 uuid := '11000000-0000-0000-0000-000000000017';
  p18 uuid := '11000000-0000-0000-0000-000000000018';

  -- 10 team UUIDs
  t1  uuid := '22000000-0000-0000-0000-000000000001'; -- real accounts
  t2  uuid := '22000000-0000-0000-0000-000000000002';
  t3  uuid := '22000000-0000-0000-0000-000000000003';
  t4  uuid := '22000000-0000-0000-0000-000000000004';
  t5  uuid := '22000000-0000-0000-0000-000000000005';
  t6  uuid := '22000000-0000-0000-0000-000000000006';
  t7  uuid := '22000000-0000-0000-0000-000000000007';
  t8  uuid := '22000000-0000-0000-0000-000000000008';
  t9  uuid := '22000000-0000-0000-0000-000000000009';
  t10 uuid := '22000000-0000-0000-0000-000000000010';

BEGIN

  -- ── Find the 2 real registered accounts ─────────────────────
  SELECT id INTO real_p1 FROM public.profiles
    WHERE email NOT LIKE '%@demo.golf'
      AND id::text NOT LIKE '11000000-%'
      AND id::text NOT LIKE 'a1000000-%'
    ORDER BY joined_at LIMIT 1;

  SELECT id INTO real_p2 FROM public.profiles
    WHERE email NOT LIKE '%@demo.golf'
      AND id::text NOT LIKE '11000000-%'
      AND id::text NOT LIKE 'a1000000-%'
      AND id != real_p1
    ORDER BY joined_at LIMIT 1;

  IF real_p1 IS NULL THEN
    RAISE EXCEPTION 'No real registered accounts found. Sign in at least once first.';
  END IF;
  IF real_p2 IS NULL THEN
    RAISE EXCEPTION 'Only one real account found. Both players need to register first.';
  END IF;

  -- Build team name from their real names
  SELECT string_agg(name, ' & ' ORDER BY joined_at) INTO real_team_name
    FROM public.profiles
    WHERE id IN (real_p1, real_p2);

  -- ── 1. Fictional auth users (cannot log in — no password) ───
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    created_at, updated_at, is_super_admin, is_sso_user,
    confirmation_token, recovery_token, email_change_token_new,
    email_change, email_change_confirm_status
  ) VALUES
    ('00000000-0000-0000-0000-000000000000', p1,  'authenticated', 'authenticated', 'happy@demo.golf',          '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p2,  'authenticated', 'authenticated', 'shooter@demo.golf',        '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p3,  'authenticated', 'authenticated', 'bob@demo.golf',            '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p4,  'authenticated', 'authenticated', 'virginia@demo.golf',       '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p5,  'authenticated', 'authenticated', 'chubbs@demo.golf',         '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p6,  'authenticated', 'authenticated', 'doug@demo.golf',           '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p7,  'authenticated', 'authenticated', 'billy@demo.golf',          '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p8,  'authenticated', 'authenticated', 'mike.chen@demo.golf',      '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p9,  'authenticated', 'authenticated', 'tommy@demo.golf',          '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p10, 'authenticated', 'authenticated', 'craig@demo.golf',          '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p11, 'authenticated', 'authenticated', 'farley@demo.golf',         '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p12, 'authenticated', 'authenticated', 'jake@demo.golf',           '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p13, 'authenticated', 'authenticated', 'tom.burke@demo.golf',      '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p14, 'authenticated', 'authenticated', 'dave.walsh@demo.golf',     '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p15, 'authenticated', 'authenticated', 'nick.patterson@demo.golf', '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p16, 'authenticated', 'authenticated', 'chris.larson@demo.golf',   '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p17, 'authenticated', 'authenticated', 'lee@demo.golf',            '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p18, 'authenticated', 'authenticated', 'otto@demo.golf',           '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0)
  ON CONFLICT (id) DO NOTHING;

  -- ── 2. Fictional profiles (real accounts left untouched) ────
  INSERT INTO public.profiles (id, name, email, role, status, handicap) VALUES
    (p1,  'Happy Gilmore',    'happy@demo.golf',          'player', 'active', 28),
    (p2,  'Shooter McGavin',  'shooter@demo.golf',        'player', 'active',  5),
    (p3,  'Bob Barker',       'bob@demo.golf',            'player', 'active',  8),
    (p4,  'Virginia Venit',   'virginia@demo.golf',       'player', 'active', 20),
    (p5,  'Chubbs Peterson',  'chubbs@demo.golf',         'player', 'active',  4),
    (p6,  'Doug Thompson',    'doug@demo.golf',           'player', 'active', 18),
    (p7,  'Billy Madison',    'billy@demo.golf',          'player', 'active', 24),
    (p8,  'Mike Chen',        'mike.chen@demo.golf',      'player', 'active', 12),
    (p9,  'Tommy McGee',      'tommy@demo.golf',          'player', 'active', 10),
    (p10, 'Craig Nelson',     'craig@demo.golf',          'player', 'active',  7),
    (p11, 'Farley Holt',      'farley@demo.golf',         'player', 'active', 16),
    (p12, 'Jake Morrison',    'jake@demo.golf',           'player', 'active', 19),
    (p13, 'Tom Burke',        'tom.burke@demo.golf',      'player', 'active', 13),
    (p14, 'Dave Walsh',       'dave.walsh@demo.golf',     'player', 'active', 21),
    (p15, 'Nick Patterson',   'nick.patterson@demo.golf', 'player', 'active', 11),
    (p16, 'Chris Larson',     'chris.larson@demo.golf',   'player', 'active', 17),
    (p17, 'Lee Trevino',      'lee@demo.golf',            'player', 'active',  6),
    (p18, 'Otto Yarbrough',   'otto@demo.golf',           'player', 'active', 14)
  ON CONFLICT (id) DO UPDATE SET
    name     = EXCLUDED.name,
    email    = EXCLUDED.email,
    status   = EXCLUDED.status,
    handicap = EXCLUDED.handicap;

  -- ── 3. Teams ─────────────────────────────────────────────────
  INSERT INTO public.teams (id, name, p1_id, p2_id) VALUES
    (t1,  real_team_name,          real_p1, real_p2),
    (t2,  'Gilmore & McGavin',     p1,  p2),
    (t3,  'Barker & Venit',        p3,  p4),
    (t4,  'Peterson & Thompson',   p5,  p6),
    (t5,  'Madison & Chen',        p7,  p8),
    (t6,  'McGee & Nelson',        p9,  p10),
    (t7,  'Holt & Morrison',       p11, p12),
    (t8,  'Burke & Walsh',         p13, p14),
    (t9,  'Patterson & Larson',    p15, p16),
    (t10, 'Trevino & Yarbrough',   p17, p18)
  ON CONFLICT (id) DO UPDATE SET
    name  = EXCLUDED.name,
    p1_id = EXCLUDED.p1_id,
    p2_id = EXCLUDED.p2_id;

  -- Sync profiles.team_id
  UPDATE public.profiles SET team_id = t1  WHERE id IN (real_p1, real_p2);
  UPDATE public.profiles SET team_id = t2  WHERE id IN (p1,  p2);
  UPDATE public.profiles SET team_id = t3  WHERE id IN (p3,  p4);
  UPDATE public.profiles SET team_id = t4  WHERE id IN (p5,  p6);
  UPDATE public.profiles SET team_id = t5  WHERE id IN (p7,  p8);
  UPDATE public.profiles SET team_id = t6  WHERE id IN (p9,  p10);
  UPDATE public.profiles SET team_id = t7  WHERE id IN (p11, p12);
  UPDATE public.profiles SET team_id = t8  WHERE id IN (p13, p14);
  UPDATE public.profiles SET team_id = t9  WHERE id IN (p15, p16);
  UPDATE public.profiles SET team_id = t10 WHERE id IN (p17, p18);

  -- ── 4. Foursomes ─────────────────────────────────────────────
  DELETE FROM public.foursomes
    WHERE team_a_id IN (t1,t2,t3,t4,t5,t6,t7,t8,t9,t10)
       OR team_b_id IN (t1,t2,t3,t4,t5,t6,t7,t8,t9,t10);

  INSERT INTO public.foursomes (team_a_id, team_b_id) VALUES
    (t1,  t2),   -- Real team          ←→ Gilmore/McGavin
    (t3,  t4),   -- Barker/Venit       ←→ Peterson/Thompson
    (t5,  t6),   -- Madison/Chen       ←→ McGee/Nelson
    (t7,  t8),   -- Holt/Morrison      ←→ Burke/Walsh
    (t9,  t10);  -- Patterson/Larson   ←→ Trevino/Yarbrough

  -- ── 5. Scores ────────────────────────────────────────────────
  -- Hole pars: [4,4,3,5,4,3,4,5,4 | 4,3,5,4,4,3,5,4,4] = 72

  -- t1 (real team) — 5 holes in, -1 (still playing)
  INSERT INTO public.scores (team_id, hole, score) VALUES
    (t1, 1, 4),(t1, 2, 3),(t1, 3, 3),(t1, 4, 5),(t1, 5, 3)
  ON CONFLICT (team_id, hole) DO UPDATE SET score = EXCLUDED.score;

  -- t2 Gilmore & McGavin — all 18, -3
  INSERT INTO public.scores (team_id, hole, score) VALUES
    (t2,  1, 3),(t2,  2, 4),(t2,  3, 2),(t2,  4, 5),(t2,  5, 4),
    (t2,  6, 3),(t2,  7, 4),(t2,  8, 5),(t2,  9, 4),
    (t2, 10, 4),(t2, 11, 3),(t2, 12, 5),(t2, 13, 3),(t2, 14, 4),
    (t2, 15, 3),(t2, 16, 5),(t2, 17, 4),(t2, 18, 4)
  ON CONFLICT (team_id, hole) DO UPDATE SET score = EXCLUDED.score;

  -- t3 Barker & Venit — all 18, +2
  INSERT INTO public.scores (team_id, hole, score) VALUES
    (t3,  1, 5),(t3,  2, 4),(t3,  3, 3),(t3,  4, 5),(t3,  5, 5),
    (t3,  6, 3),(t3,  7, 4),(t3,  8, 5),(t3,  9, 4),
    (t3, 10, 4),(t3, 11, 3),(t3, 12, 5),(t3, 13, 4),(t3, 14, 5),
    (t3, 15, 3),(t3, 16, 5),(t3, 17, 4),(t3, 18, 4)
  ON CONFLICT (team_id, hole) DO UPDATE SET score = EXCLUDED.score;

  -- t4 Peterson & Thompson — front 9 only, -1
  INSERT INTO public.scores (team_id, hole, score) VALUES
    (t4, 1, 4),(t4, 2, 3),(t4, 3, 3),(t4, 4, 5),(t4, 5, 4),
    (t4, 6, 3),(t4, 7, 4),(t4, 8, 5),(t4, 9, 3)
  ON CONFLICT (team_id, hole) DO UPDATE SET score = EXCLUDED.score;

  -- t5 Madison & Chen — all 18, -5 (outright leader)
  INSERT INTO public.scores (team_id, hole, score) VALUES
    (t5,  1, 3),(t5,  2, 4),(t5,  3, 2),(t5,  4, 4),(t5,  5, 3),
    (t5,  6, 3),(t5,  7, 4),(t5,  8, 4),(t5,  9, 4),
    (t5, 10, 3),(t5, 11, 3),(t5, 12, 4),(t5, 13, 4),(t5, 14, 4),
    (t5, 15, 3),(t5, 16, 5),(t5, 17, 4),(t5, 18, 4)
  ON CONFLICT (team_id, hole) DO UPDATE SET score = EXCLUDED.score;

  -- t6 McGee & Nelson — all 18, even par
  INSERT INTO public.scores (team_id, hole, score) VALUES
    (t6,  1, 4),(t6,  2, 4),(t6,  3, 3),(t6,  4, 5),(t6,  5, 4),
    (t6,  6, 3),(t6,  7, 4),(t6,  8, 5),(t6,  9, 4),
    (t6, 10, 4),(t6, 11, 3),(t6, 12, 5),(t6, 13, 4),(t6, 14, 4),
    (t6, 15, 3),(t6, 16, 5),(t6, 17, 4),(t6, 18, 4)
  ON CONFLICT (team_id, hole) DO UPDATE SET score = EXCLUDED.score;

  -- t7 Holt & Morrison — 12 holes, -2
  INSERT INTO public.scores (team_id, hole, score) VALUES
    (t7,  1, 3),(t7,  2, 4),(t7,  3, 3),(t7,  4, 5),(t7,  5, 4),
    (t7,  6, 3),(t7,  7, 3),(t7,  8, 5),(t7,  9, 4),
    (t7, 10, 4),(t7, 11, 3),(t7, 12, 5)
  ON CONFLICT (team_id, hole) DO UPDATE SET score = EXCLUDED.score;

  -- t8 Burke & Walsh — all 18, -4 (chasing the lead)
  INSERT INTO public.scores (team_id, hole, score) VALUES
    (t8,  1, 4),(t8,  2, 3),(t8,  3, 3),(t8,  4, 4),(t8,  5, 4),
    (t8,  6, 2),(t8,  7, 4),(t8,  8, 5),(t8,  9, 3),
    (t8, 10, 4),(t8, 11, 3),(t8, 12, 5),(t8, 13, 3),(t8, 14, 4),
    (t8, 15, 3),(t8, 16, 5),(t8, 17, 4),(t8, 18, 4)
  ON CONFLICT (team_id, hole) DO UPDATE SET score = EXCLUDED.score;

  -- t9 Patterson & Larson — no scores yet (haven't teed off)
  -- t10 Trevino & Yarbrough — no scores yet (haven't teed off)

  -- ── 6. Score approvals ───────────────────────────────────────
  INSERT INTO public.score_approvals (score_id, approving_team_id)
    SELECT s.id, t2 FROM public.scores s WHERE s.team_id = t1
  ON CONFLICT (score_id) DO NOTHING;

  INSERT INTO public.score_approvals (score_id, approving_team_id)
    SELECT s.id, t1 FROM public.scores s WHERE s.team_id = t2 AND s.hole <= 5
  ON CONFLICT (score_id) DO NOTHING;

  INSERT INTO public.score_approvals (score_id, approving_team_id)
    SELECT s.id, t4 FROM public.scores s WHERE s.team_id = t3
  ON CONFLICT (score_id) DO NOTHING;

  INSERT INTO public.score_approvals (score_id, approving_team_id)
    SELECT s.id, t3 FROM public.scores s WHERE s.team_id = t4
  ON CONFLICT (score_id) DO NOTHING;

  INSERT INTO public.score_approvals (score_id, approving_team_id)
    SELECT s.id, t6 FROM public.scores s WHERE s.team_id = t5
  ON CONFLICT (score_id) DO NOTHING;

  INSERT INTO public.score_approvals (score_id, approving_team_id)
    SELECT s.id, t5 FROM public.scores s WHERE s.team_id = t6
  ON CONFLICT (score_id) DO NOTHING;

  INSERT INTO public.score_approvals (score_id, approving_team_id)
    SELECT s.id, t8 FROM public.scores s WHERE s.team_id = t7
  ON CONFLICT (score_id) DO NOTHING;

  INSERT INTO public.score_approvals (score_id, approving_team_id)
    SELECT s.id, t7 FROM public.scores s WHERE s.team_id = t8
  ON CONFLICT (score_id) DO NOTHING;

  -- ── 7. Tee times ─────────────────────────────────────────────
  DELETE FROM public.tee_times
    WHERE team_id IN (t1,t2,t3,t4,t5,t6,t7,t8,t9,t10);

  INSERT INTO public.tee_times (team_id, tee_time, starting_hole, cart) VALUES
    (t1,  '08:00:00', 1,  'Cart 1'),
    (t2,  '08:00:00', 10, 'Cart 2'),
    (t3,  '08:10:00', 1,  'Cart 3'),
    (t4,  '08:10:00', 10, 'Cart 4'),
    (t5,  '08:20:00', 1,  'Cart 5'),
    (t6,  '08:20:00', 10, 'Cart 6'),
    (t7,  '08:30:00', 1,  'Cart 7'),
    (t8,  '08:30:00', 10, 'Cart 8'),
    (t9,  '08:40:00', 1,  'Cart 9'),
    (t10, '08:40:00', 10, 'Cart 10');

  -- ── 8. Announcements ─────────────────────────────────────────
  INSERT INTO public.updates (id, title, body, pinned, created_by) VALUES
    (
      '33000000-0000-0000-0000-000000000001',
      'Welcome to The Chubbs Invitational!',
      'Welcome, golfers! The day is finally here. Remember — it''s all in the hips. Check your tee time and enter your scores as you play. Best ball format — take the lowest score between you and your partner for each hole. Good luck out there! 🏌️',
      true,
      real_p1
    ),
    (
      '33000000-0000-0000-0000-000000000002',
      'Cart Rules',
      'Stay on the cart path within 30 yards of the green. Cart numbers are on the tee sheet. See the clubhouse if you have any issues.',
      false,
      real_p1
    )
  ON CONFLICT (id) DO UPDATE SET
    title      = EXCLUDED.title,
    body       = EXCLUDED.body,
    pinned     = EXCLUDED.pinned,
    created_by = EXCLUDED.created_by;

  RAISE NOTICE 'Demo data loaded! 10 teams (real team: %), 18 fictional players. Real accounts untouched.', real_team_name;
END;
$$;
