-- Push subscriptions (one per user, upserted on re-subscribe)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription jsonb NOT NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscription"
  ON public.push_subscriptions FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Track current leader so we only notify on change
ALTER TABLE public.tournament_settings
  ADD COLUMN IF NOT EXISTS current_leader_team_id uuid
    REFERENCES public.teams(id) ON DELETE SET NULL;
