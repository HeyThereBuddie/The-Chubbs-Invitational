-- The Chubbs Invitational — Demo Seed Data
-- Populates scores, drives, putts, chulligans, contest entries (CTP/LD),
-- jackass votes, tee times, and feed events for every active team.
--
-- Requirements:
--   • An active tournament exists (Admin panel > Tournament tab)
--   • Teams have been created (Groups > Save & Release)
--   • Migrations 024 and 025 have been applied
--
-- Run in: Supabase SQL Editor

DO $$
DECLARE
  v_tid      uuid;
  v_team     record;
  v_h        int;
  v_par      int;
  v_score    int;
  v_label    text;
  v_emoji    text;
  v_putts    int;
  v_drv_id   uuid;
  v_drv_name text;
  v_idx      int := 0;
  v_chull_h  int;
  v_nom_id   uuid;
  v_nom_name text;
  v_voter    record;
  v_player   record;

  -- Royal Ashburn Golf Club par values (matches HOLE_PARS in Scores.tsx)
  -- Par 3s: 4,7,13,16  |  Par 5s: 1,3,14,17  |  Par 4s: rest
  v_pars int[] := ARRAY[5,4,5,3,4,4,3,4,4, 4,4,4,3,5,4,3,5,4];

BEGIN
  /* ── 1. Resolve active tournament ────────────────────────────── */
  SELECT id INTO v_tid
  FROM tournaments WHERE status = 'active' AND deleted_at IS NULL LIMIT 1;

  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'No active tournament. Create one in the Admin panel first.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE tournament_id = v_tid LIMIT 1) THEN
    RAISE EXCEPTION 'No teams found for this tournament. Run Groups > Save & Release first.';
  END IF;

  RAISE NOTICE 'Seeding demo data for tournament %', v_tid;

  /* ── 2. Clean slate for this tournament ──────────────────────── */
  DELETE FROM feed_events     WHERE tournament_id = v_tid;
  DELETE FROM leahey_votes    WHERE tournament_id = v_tid;
  DELETE FROM contest_entries WHERE tournament_id = v_tid;
  DELETE FROM chulligans
    WHERE team_id IN (SELECT id FROM teams WHERE tournament_id = v_tid);
  DELETE FROM scores
    WHERE team_id IN (SELECT id FROM teams WHERE tournament_id = v_tid);
  DELETE FROM tee_times
    WHERE team_id IN (SELECT id FROM teams WHERE tournament_id = v_tid);

  /* ── 3. Tee times — shotgun start at 8:00 AM, 10-min gaps ───── */
  v_idx := 0;
  FOR v_team IN
    SELECT id FROM teams WHERE tournament_id = v_tid ORDER BY name
  LOOP
    INSERT INTO tee_times (id, team_id, tee_time, starting_hole, cart)
    VALUES (
      gen_random_uuid(), v_team.id,
      ('08:00'::time + (v_idx * interval '10 minutes')),
      1,
      'Cart ' || (v_idx + 1)::text
    );
    v_idx := v_idx + 1;
  END LOOP;

  /* ── 4. Scores + drives + putts + chulligans ─────────────────── */
  v_idx := 0;
  FOR v_team IN
    SELECT t.id, t.name, t.p1_id, t.p2_id,
           COALESCE(p1.name, 'Player 1') AS p1_name,
           COALESCE(p2.name, 'Player 2') AS p2_name
    FROM teams t
    LEFT JOIN profiles p1 ON p1.id = t.p1_id
    LEFT JOIN profiles p2 ON p2.id = t.p2_id
    WHERE t.tournament_id = v_tid
    ORDER BY t.name
  LOOP
    v_idx := v_idx + 1;

    FOR v_h IN 1..18 LOOP
      v_par := v_pars[v_h];

      /* Realistic best-ball score: -1 to +3 from par */
      v_score := v_par + (floor(random() * 5) - 1)::int;
      v_score := greatest(2, v_score);

      /* Labels and emojis matching scoreFeedInfo() in Scores.tsx exactly */
      IF    v_score <= v_par - 2 THEN v_label := 'Eagle';  v_emoji := '🦅';
      ELSIF v_score =  v_par - 1 THEN v_label := 'Birdie'; v_emoji := '🐦';
      ELSIF v_score =  v_par     THEN v_label := 'Par';    v_emoji := '⛳';
      ELSIF v_score =  v_par + 1 THEN v_label := 'Bogey';  v_emoji := '😬';
      ELSIF v_score =  v_par + 2 THEN v_label := 'Double'; v_emoji := '😤';
      ELSE                            v_label := '+' || (v_score - v_par)::text;
                                      v_emoji := '💥';
      END IF;

      /* Putts: eagles = 1, ~2% 4-putt, ~8% 3-putt, otherwise 2 */
      IF    v_label = 'Eagle'  THEN v_putts := 1;
      ELSIF random() < 0.02    THEN v_putts := 4;
      ELSIF random() < 0.08    THEN v_putts := 3;
      ELSE                          v_putts := 2;
      END IF;

      /* Drive distribution guaranteeing min 4 per player per 9 holes:
         Front (1-9):  p1 drives odd holes (1,3,5,7,9 = 5), p2 drives even (2,4,6,8 = 4)
         Back  (10-18): p2 drives even holes (10,12,14,16,18 = 5), p1 drives odd (11,13,15,17 = 4) */
      IF v_team.p1_id IS NOT NULL AND v_team.p2_id IS NOT NULL THEN
        IF (v_h <= 9 AND v_h % 2 = 1) OR (v_h > 9 AND v_h % 2 = 1) THEN
          v_drv_id := v_team.p1_id;  v_drv_name := v_team.p1_name;
        ELSE
          v_drv_id := v_team.p2_id;  v_drv_name := v_team.p2_name;
        END IF;
      ELSE
        v_drv_id   := COALESCE(v_team.p1_id, v_team.p2_id);
        v_drv_name := CASE WHEN v_team.p1_id IS NOT NULL
                           THEN v_team.p1_name ELSE v_team.p2_name END;
      END IF;

      /* Score row */
      INSERT INTO scores (id, team_id, hole, score, updated_at, drive_used_id, putts)
      VALUES (
        gen_random_uuid(), v_team.id, v_h, v_score,
        now() - (interval '1 minute' * (19 - v_h) * 10) + (v_idx * interval '30 seconds'),
        v_drv_id, v_putts
      );

      /* Score feed event */
      INSERT INTO feed_events (
        id, event_type, team_id, team_name, player_name,
        hole, score, label, emoji, created_at, tournament_id
      ) VALUES (
        gen_random_uuid(), 'score', v_team.id, v_team.name, v_drv_name,
        v_h, v_score, v_label, v_emoji,
        now() - (interval '1 minute' * (19 - v_h) * 10) + (v_idx * interval '30 seconds'),
        v_tid
      );

      /* 3-Putt / 4-Putt feed events (matching puttFeedInfo in Scores.tsx) */
      IF v_putts = 4 THEN
        INSERT INTO feed_events (
          id, event_type, team_id, team_name, player_name,
          hole, score, label, emoji, created_at, tournament_id
        ) VALUES (
          gen_random_uuid(), 'putt', v_team.id, v_team.name,
          CASE WHEN v_h % 2 = 1 THEN v_team.p1_name ELSE v_team.p2_name END,
          v_h, NULL, '4-Putt', '😱',
          now() - (interval '1 minute' * (19 - v_h) * 10) + (v_idx * interval '30 seconds') + interval '1 minute',
          v_tid
        );
      ELSIF v_putts = 3 THEN
        INSERT INTO feed_events (
          id, event_type, team_id, team_name, player_name,
          hole, score, label, emoji, created_at, tournament_id
        ) VALUES (
          gen_random_uuid(), 'putt', v_team.id, v_team.name,
          CASE WHEN v_h % 2 = 1 THEN v_team.p1_name ELSE v_team.p2_name END,
          v_h, NULL, '3-Putt', '😰',
          now() - (interval '1 minute' * (19 - v_h) * 10) + (v_idx * interval '30 seconds') + interval '1 minute',
          v_tid
        );
      END IF;
    END LOOP; -- end holes loop

    /* Chulligans: one per player per round */
    IF v_team.p1_id IS NOT NULL THEN
      v_chull_h := (floor(random() * 14) + 2)::int;  -- any hole 2–15
      INSERT INTO chulligans (id, team_id, player_id, hole, created_at)
      VALUES (gen_random_uuid(), v_team.id, v_team.p1_id, v_chull_h,
              now() - interval '4 hours' + (v_idx * interval '3 minutes'));
      INSERT INTO feed_events (id, event_type, team_id, team_name, player_name, hole, score, label, emoji, created_at, tournament_id)
      VALUES (gen_random_uuid(), 'chulligan', v_team.id, v_team.name, v_team.p1_name,
              v_chull_h, NULL, 'Chulligan', '🍺',
              now() - interval '4 hours' + (v_idx * interval '3 minutes'), v_tid);
    END IF;

    IF v_team.p2_id IS NOT NULL THEN
      v_chull_h := (floor(random() * 14) + 2)::int;
      INSERT INTO chulligans (id, team_id, player_id, hole, created_at)
      VALUES (gen_random_uuid(), v_team.id, v_team.p2_id, v_chull_h,
              now() - interval '2 hours' + (v_idx * interval '3 minutes'));
      INSERT INTO feed_events (id, event_type, team_id, team_name, player_name, hole, score, label, emoji, created_at, tournament_id)
      VALUES (gen_random_uuid(), 'chulligan', v_team.id, v_team.name, v_team.p2_name,
              v_chull_h, NULL, 'Chulligan', '🍺',
              now() - interval '2 hours' + (v_idx * interval '3 minutes'), v_tid);
    END IF;

  END LOOP; -- end teams loop

  /* ── 5. Contest entries: CTP and LD ─────────────────────────── */
  -- The app uses hole=1 and distance='' (photos are optional, skipped here).
  -- Entry order (created_at) determines the leaderboard — most recent = #1.
  FOR v_player IN
    SELECT DISTINCT p.id, p.name
    FROM profiles p
    JOIN teams t ON (t.p1_id = p.id OR t.p2_id = p.id)
    WHERE t.tournament_id = v_tid AND p.status = 'active'
  LOOP
    -- CTP entry (~80% of players enter)
    IF random() < 0.80 THEN
      INSERT INTO contest_entries (id, type, player_id, hole, distance, photo_url, created_at, tournament_id)
      VALUES (gen_random_uuid(), 'ctp', v_player.id, 1, '', NULL,
              now() - interval '4 hours' + (random() * interval '3 hours 30 minutes'), v_tid);
      INSERT INTO feed_events (id, event_type, team_id, team_name, player_name, hole, score, label, emoji, created_at, tournament_id)
      VALUES (gen_random_uuid(), 'contest', NULL, '', v_player.name, 0, NULL, 'CTP Entry', '🎯',
              now() - interval '4 hours' + (random() * interval '3 hours 30 minutes'), v_tid);
    END IF;

    -- LD entry (~80% of players enter)
    IF random() < 0.80 THEN
      INSERT INTO contest_entries (id, type, player_id, hole, distance, photo_url, created_at, tournament_id)
      VALUES (gen_random_uuid(), 'ld', v_player.id, 1, '', NULL,
              now() - interval '5 hours' + (random() * interval '4 hours'), v_tid);
      INSERT INTO feed_events (id, event_type, team_id, team_name, player_name, hole, score, label, emoji, created_at, tournament_id)
      VALUES (gen_random_uuid(), 'contest', NULL, '', v_player.name, 0, NULL, 'LD Entry', '💥',
              now() - interval '5 hours' + (random() * interval '4 hours'), v_tid);
    END IF;
  END LOOP;

  /* ── 6. Jackass votes — every active player casts one ────────── */
  FOR v_voter IN
    SELECT DISTINCT p.id AS voter_id, p.name AS voter_name
    FROM profiles p
    JOIN teams t ON (t.p1_id = p.id OR t.p2_id = p.id)
    WHERE t.tournament_id = v_tid AND p.status = 'active'
  LOOP
    -- Pick a random nominee who isn't the voter
    SELECT p2.id, p2.name INTO v_nom_id, v_nom_name
    FROM profiles p2
    JOIN teams t2 ON (t2.p1_id = p2.id OR t2.p2_id = p2.id)
    WHERE t2.tournament_id = v_tid
      AND p2.status = 'active'
      AND p2.id != v_voter.voter_id
    ORDER BY random()
    LIMIT 1;

    IF v_nom_id IS NOT NULL THEN
      -- ON CONFLICT handles players who voted in a previous tournament
      -- (leahey_votes has UNIQUE(voter_id) not scoped to tournament)
      INSERT INTO leahey_votes (id, voter_id, nominee_id, created_at, tournament_id)
      VALUES (
        gen_random_uuid(), v_voter.voter_id, v_nom_id,
        now() - interval '30 minutes' + (random() * interval '25 minutes'),
        v_tid
      )
      ON CONFLICT (voter_id) DO UPDATE SET
        nominee_id    = EXCLUDED.nominee_id,
        created_at    = EXCLUDED.created_at,
        tournament_id = EXCLUDED.tournament_id;

      INSERT INTO feed_events (
        id, event_type, team_id, team_name,
        player_name, voter_name, hole, score, label, emoji, created_at, tournament_id
      ) VALUES (
        gen_random_uuid(), 'contest', NULL, '',
        v_nom_name, v_voter.voter_name, 0, NULL, 'Jackass Vote', '🤠',
        now() - interval '30 minutes' + (random() * interval '25 minutes'),
        v_tid
      );
    END IF;
  END LOOP;

  /* ── 7. Open jackass voting in tournament settings ───────────── */
  UPDATE tournament_settings SET lahey_voting_open = true WHERE id = 1;

  RAISE NOTICE 'Done! Demo data seeded successfully.';
END $$;
