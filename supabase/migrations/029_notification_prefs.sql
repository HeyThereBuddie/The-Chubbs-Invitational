-- Add per-user notification preferences to push subscriptions
ALTER TABLE public.push_subscriptions
ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT
  '{"lead_change":true,"top3_shift":true,"hot_streak":true,"eagle":true,"round_complete":true,"team_scores":true,"contest_winner":true,"alligator":true,"choking":true,"score_disputed":false}';

-- Add state-tracking columns needed for new notification types
ALTER TABLE public.tournament_settings
ADD COLUMN IF NOT EXISTS notif_top3_ids     JSONB    DEFAULT '[]',
ADD COLUMN IF NOT EXISTS notif_leader_to_par INTEGER  DEFAULT NULL,
ADD COLUMN IF NOT EXISTS notif_round_complete BOOLEAN DEFAULT FALSE;
