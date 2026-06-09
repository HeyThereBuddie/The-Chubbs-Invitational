CREATE TABLE public.feed_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  text        NOT NULL CHECK (event_type IN ('score', 'chulligan', 'putt')),
  team_id     uuid        REFERENCES public.teams(id) ON DELETE CASCADE,
  team_name   text        NOT NULL DEFAULT '',
  player_name text,
  hole        int         NOT NULL,
  score       int,
  label       text        NOT NULL DEFAULT '',
  emoji       text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_events: authenticated read"
  ON public.feed_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "feed_events: authenticated write"
  ON public.feed_events FOR ALL TO authenticated USING (true);
