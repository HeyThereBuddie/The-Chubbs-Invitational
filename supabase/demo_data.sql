-- ============================================================
-- The Chubbs Invitational — Demo Data
-- Run AFTER migration 005_unify_profiles.sql
-- Safe to run multiple times (idempotent)
-- ============================================================

DO $$
DECLARE
  admin_id uuid;

  -- Fictional player UUIDs (fixed so script is idempotent)
  p_mike     uuid := '11000000-0000-0000-0000-000000000001';
  p_happy    uuid := '11000000-0000-0000-0000-000000000002';
  p_billy    uuid := '11000000-0000-0000-0000-000000000003';
  p_shooter  uuid := '11000000-0000-0000-0000-000000000004';
  p_virginia uuid := '11000000-0000-0000-0000-000000000005';
  p_bob      uuid := '11000000-0000-0000-0000-000000000006';
  p_doug     uuid := '11000000-0000-0000-0000-000000000007';
  p_tommy    uuid := '11000000-0000-0000-0000-000000000008';
  p_farley   uuid := '11000000-0000-0000-0000-000000000009';
  p_craig    uuid := '11000000-0000-0000-0000-000000000010';
  p_jake     uuid := '11000000-0000-0000-0000-000000000011';
  p_tom      uuid := '11000000-0000-0000-0000-000000000012';
  p_dave     uuid := '11000000-0000-0000-0000-000000000013';
  p_nick     uuid := '11000000-0000-0000-0000-000000000014';
  p_chris    uuid := '11000000-0000-0000-0000-000000000015';

  -- Team UUIDs (fixed)
  t1 uuid := '22000000-0000-0000-0000-000000000001'; -- Admin's team
  t2 uuid := '22000000-0000-0000-0000-000000000002';
  t3 uuid := '22000000-0000-0000-0000-000000000003';
  t4 uuid := '22000000-0000-0000-0000-000000000004';
  t5 uuid := '22000000-0000-0000-0000-000000000005';
  t6 uuid := '22000000-0000-0000-0000-000000000006';
  t7 uuid := '22000000-0000-0000-0000-000000000007';
  t8 uuid := '22000000-0000-0000-0000-000000000008';

BEGIN

  -- ── Find real admin ──────────────────────────────────────────
  SELECT id INTO admin_id FROM public.profiles
    WHERE email = 'evankosmidis@gmail.com' LIMIT 1;

  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin profile not found. Make sure you are signed in at least once first.';
  END IF;

  -- ── 1. Fictional auth users ──────────────────────────────────
  -- Empty encrypted_password means they cannot log in — demo only
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    created_at, updated_at, is_super_admin, is_sso_user,
    confirmation_token, recovery_token, email_change_token_new,
    email_change, email_change_confirm_status
  ) VALUES
    ('00000000-0000-0000-0000-000000000000', p_mike,     'authenticated', 'authenticated', 'mike.chen@demo.golf',      '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p_happy,    'authenticated', 'authenticated', 'happy@demo.golf',          '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p_billy,    'authenticated', 'authenticated', 'billy@demo.golf',          '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p_shooter,  'authenticated', 'authenticated', 'shooter@demo.golf',        '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p_virginia, 'authenticated', 'authenticated', 'virginia@demo.golf',       '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p_bob,      'authenticated', 'authenticated', 'bob@demo.golf',            '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p_doug,     'authenticated', 'authenticated', 'doug@demo.golf',           '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p_tommy,    'authenticated', 'authenticated', 'tommy@demo.golf',          '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p_farley,   'authenticated', 'authenticated', 'farley@demo.golf',         '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p_craig,    'authenticated', 'authenticated', 'craig@demo.golf',          '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p_jake,     'authenticated', 'authenticated', 'jake@demo.golf',           '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p_tom,      'authenticated', 'authenticated', 'tom.burke@demo.golf',      '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p_dave,     'authenticated', 'authenticated', 'dave.walsh@demo.golf',     '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p_nick,     'authenticated', 'authenticated', 'nick.patterson@demo.golf', '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0),
    ('00000000-0000-0000-0000-000000000000', p_chris,    'authenticated', 'authenticated', 'chris.larson@demo.golf',   '', now(), '{}', '{"provider":"email","providers":["email"]}', now(), now(), false, false, '', '', '', '', 0)
  ON CONFLICT (id) DO NOTHING;

  -- ── 2. Upsert profiles with handicaps ────────────────────────
  INSERT INTO public.profiles (id, name, email, role, status, handicap) VALUES
    (p_mike,     'Mike Chen',       'mike.chen@demo.golf',      'player', 'active',  12),
    (p_happy,    'Happy Gilmore',   'happy@demo.golf',          'player', 'active',  28),
    (p_billy,    'Billy Madison',   'billy@demo.golf',          'player', 'active',  24),
    (p_shooter,  'Shooter McGavin', 'shooter@demo.golf',        'player', 'active',   5),
    (p_virginia, 'Virginia Venit',  'virginia@demo.golf',       'player', 'active',  20),
    (p_bob,      'Bob Barker',      'bob@demo.golf',            'player', 'active',   8),
    (p_doug,     'Doug Thompson',   'doug@demo.golf',           'player', 'active',  18),
    (p_tommy,    'Tommy McGee',     'tommy@demo.golf',          'player', 'active',  10),
    (p_farley,   'Farley Holt',     'farley@demo.golf',         'player', 'active',  16),
    (p_craig,    'Craig Nelson',    'craig@demo.golf',          'player', 'active',   7),
    (p_jake,     'Jake Morrison',   'jake@demo.golf',           'player', 'active',  19),
    (p_tom,      'Tom Burke',       'tom.burke@demo.golf',      'player', 'active',  13),
    (p_dave,     'Dave Walsh',      'dave.walsh@demo.golf',     'player', 'active',  21),
    (p_nick,     'Nick Patterson',  'nick.patterson@demo.golf', 'player', 'active',  11),
    (p_chris,    'Chris Larson',    'chris.larson@demo.golf',   'player', 'active',  17)
  ON CONFLICT (id) DO UPDATE SET
    name     = EXCLUDED.name,
    email    = EXCLUDED.email,
    status   = EXCLUDED.status,
    handicap = EXCLUDED.handicap;

  -- Set admin handicap + ensure active status
  UPDATE public.profiles SET handicap = 15, status = 'active' WHERE id = admin_id;

  -- ── 3. Teams ─────────────────────────────────────────────────
  INSERT INTO public.teams (id, name, p1_id, p2_id) VALUES
    (t1, 'Kosmidis & Chen',   admin_id,  p_mike),
    (t2, 'Happy Feet',         p_happy,   p_billy),
    (t3, 'McGavin & Venit',    p_shooter, p_virginia),
    (t4, 'Barker & Thompson',  p_bob,     p_doug),
    (t5, 'McGee & Holt',       p_tommy,   p_farley),
    (t6, 'Nelson & Morrison',  p_craig,   p_jake),
    (t7, 'Burke & Walsh',      p_tom,     p_dave),
    (t8, 'Patterson & Larson', p_nick,    p_chris)
  ON CONFLICT (id) DO UPDATE SET
    name  = EXCLUDED.name,
    p1_id = EXCLUDED.p1_id,
    p2_id = EXCLUDED.p2_id;

  -- Sync profiles.team_id
  UPDATE public.profiles SET team_id = t1 WHERE id IN (admin_id, p_mike);
  UPDATE public.profiles SET team_id = t2 WHERE id IN (p_happy,   p_billy);
  UPDATE public.profiles SET team_id = t3 WHERE id IN (p_shooter, p_virginia);
  UPDATE public.profiles SET team_id = t4 WHERE id IN (p_bob,     p_doug);
  UPDATE public.profiles SET team_id = t5 WHERE id IN (p_tommy,   p_farley);
  UPDATE public.profiles SET team_id = t6 WHERE id IN (p_craig,   p_jake);
  UPDATE public.profiles SET team_id = t7 WHERE id IN (p_tom,     p_dave);
  UPDATE public.profiles SET team_id = t8 WHERE id IN (p_nick,    p_chris);

  -- ── 4. Foursomes ─────────────────────────────────────────────
  -- Clear any stale foursomes for these teams before reinserting
  DELETE FROM public.foursomes
    WHERE team_a_id IN (t1,t2,t3,t4,t5,t6,t7,t8)
       OR team_b_id IN (t1,t2,t3,t4,t5,t6,t7,t8);

  INSERT INTO public.foursomes (team_a_id, team_b_id) VALUES
    (t1, t2),  -- Kosmidis/Chen  ←→ Happy Feet
    (t3, t4),  -- McGavin/Venit  ←→ Barker/Thompson
    (t5, t6),  -- McGee/Holt     ←→ Nelson/Morrison
    (t7, t8);  -- Burke/Walsh    ←→ Patterson/Larson

  -- ── 5. Scores ────────────────────────────────────────────────
  -- Hole pars: [4,4,3,5,4,3,4,5,4 | 4,3,5,4,4,3,5,4,4]

  -- Team 1 (admin) — 4 holes in, -1 (plenty left to test entry)
  INSERT INTO public.scores (team_id, hole, score) VALUES
    (t1, 1, 4), (t1, 2, 3), (t1, 3, 3), (t1, 4, 5)
  ON CONFLICT (team_id, hole) DO UPDATE SET score = EXCLUDED.score;

  -- Team 2 (Happy Feet) — all 18 holes, -3
  INSERT INTO public.scores (team_id, hole, score) VALUES
    (t2,  1, 4),(t2,  2, 3),(t2,  3, 2),(t2,  4, 5),(t2,  5, 3),
    (t2,  6, 3),(t2,  7, 4),(t2,  8, 5),(t2,  9, 4),
    (t2, 10, 4),(t2, 11, 3),(t2, 12, 5),(t2, 13, 4),(t2, 14, 4),
    (t2, 15, 3),(t2, 16, 5),(t2, 17, 4),(t2, 18, 4)
  ON CONFLICT (team_id, hole) DO UPDATE SET score = EXCLUDED.score;

  -- Team 3 (McGavin & Venit) — all 18, +2
  INSERT INTO public.scores (team_id, hole, score) VALUES
    (t3,  1, 5),(t3,  2, 4),(t3,  3, 3),(t3,  4, 5),(t3,  5, 4),
    (t3,  6, 4),(t3,  7, 4),(t3,  8, 5),(t3,  9, 3),
    (t3, 10, 5),(t3, 11, 3),(t3, 12, 5),(t3, 13, 4),(t3, 14, 4),
    (t3, 15, 3),(t3, 16, 5),(t3, 17, 5),(t3, 18, 4)
  ON CONFLICT (team_id, hole) DO UPDATE SET score = EXCLUDED.score;

  -- Team 4 (Barker & Thompson) — front 9 only, -1
  INSERT INTO public.scores (team_id, hole, score) VALUES
    (t4, 1, 3),(t4, 2, 4),(t4, 3, 3),(t4, 4, 5),(t4, 5, 4),
    (t4, 6, 3),(t4, 7, 4),(t4, 8, 5),(t4, 9, 4)
  ON CONFLICT (team_id, hole) DO UPDATE SET score = EXCLUDED.score;

  -- Team 5 (McGee & Holt) — all 18, -5 (current leader)
  INSERT INTO public.scores (team_id, hole, score) VALUES
    (t5,  1, 3),(t5,  2, 4),(t5,  3, 3),(t5,  4, 4),(t5,  5, 3),
    (t5,  6, 3),(t5,  7, 4),(t5,  8, 5),(t5,  9, 3),
    (t5, 10, 4),(t5, 11, 3),(t5, 12, 4),(t5, 13, 4),(t5, 14, 4),
    (t5, 15, 3),(t5, 16, 5),(t5, 17, 4),(t5, 18, 4)
  ON CONFLICT (team_id, hole) DO UPDATE SET score = EXCLUDED.score;

  -- Team 6 (Nelson & Morrison) — all 18, even par
  INSERT INTO public.scores (team_id, hole, score) VALUES
    (t6,  1, 4),(t6,  2, 4),(t6,  3, 3),(t6,  4, 5),(t6,  5, 4),
    (t6,  6, 3),(t6,  7, 4),(t6,  8, 5),(t6,  9, 4),
    (t6, 10, 4),(t6, 11, 3),(t6, 12, 5),(t6, 13, 4),(t6, 14, 4),
    (t6, 15, 3),(t6, 16, 5),(t6, 17, 4),(t6, 18, 4)
  ON CONFLICT (team_id, hole) DO UPDATE SET score = EXCLUDED.score;

  -- Teams 7 & 8 — no scores yet (haven't teed off)

  -- ── 6. Score approvals (make the workflow look realistic) ─────
  -- Happy Feet approved holes 1–4 of admin's team
  INSERT INTO public.score_approvals (score_id, approving_team_id)
    SELECT s.id, t2 FROM public.scores s WHERE s.team_id = t1
  ON CONFLICT (score_id) DO NOTHING;

  -- Admin's team approved holes 1–9 of Happy Feet (back 9 still pending)
  INSERT INTO public.score_approvals (score_id, approving_team_id)
    SELECT s.id, t1 FROM public.scores s WHERE s.team_id = t2 AND s.hole <= 9
  ON CONFLICT (score_id) DO NOTHING;

  -- Full mutual approvals for teams 3 & 4, and 5 & 6
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

  -- ── 7. Tee times ─────────────────────────────────────────────
  DELETE FROM public.tee_times
    WHERE team_id IN (t1,t2,t3,t4,t5,t6,t7,t8);

  INSERT INTO public.tee_times (team_id, tee_time, starting_hole, cart) VALUES
    (t1, '08:00:00', 1, 'Cart 1'),
    (t2, '08:00:00', 1, 'Cart 2'),
    (t3, '08:10:00', 1, 'Cart 3'),
    (t4, '08:10:00', 1, 'Cart 4'),
    (t5, '08:20:00', 1, 'Cart 5'),
    (t6, '08:20:00', 1, 'Cart 6'),
    (t7, '08:30:00', 1, 'Cart 7'),
    (t8, '08:30:00', 1, 'Cart 8');

  -- ── 8. Announcements ─────────────────────────────────────────
  INSERT INTO public.updates (id, title, body, pinned, created_by) VALUES
    (
      '33000000-0000-0000-0000-000000000001',
      'Welcome to The Chubbs Invitational!',
      'Welcome, golfers! The day is finally here. Remember — it''s all in the hips. Check your tee time and enter your scores as you play. Best ball format — take the lowest score between you and your partner for each hole. Good luck out there! 🏌️',
      true,
      admin_id
    ),
    (
      '33000000-0000-0000-0000-000000000002',
      'Cart Rules',
      'Stay on the cart path within 30 yards of the green. Cart numbers are on the tee sheet. See the clubhouse if you have any issues.',
      false,
      admin_id
    )
  ON CONFLICT (id) DO UPDATE SET
    title      = EXCLUDED.title,
    body       = EXCLUDED.body,
    pinned     = EXCLUDED.pinned,
    created_by = EXCLUDED.created_by;

  RAISE NOTICE 'Demo data loaded! 8 teams, 15 fictional players + admin (evankosmidis@gmail.com), 4 foursomes.';
END;
$$;
