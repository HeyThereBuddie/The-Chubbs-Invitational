-- Feed reactions: players can react to any feed event with an emoji.
-- UNIQUE(event_id, player_id, emoji) allows multiple emoji per player per event.

CREATE TABLE IF NOT EXISTS public.feed_reactions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid        NOT NULL REFERENCES public.feed_events(id) ON DELETE CASCADE,
  player_id  uuid        NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  emoji      text        NOT NULL CHECK (char_length(emoji) <= 8),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_reactions
  ADD CONSTRAINT feed_reactions_unique UNIQUE (event_id, player_id, emoji);

CREATE INDEX feed_reactions_event_idx ON public.feed_reactions (event_id);

ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_reactions_read"
  ON public.feed_reactions FOR SELECT USING (true);

CREATE POLICY "feed_reactions_insert"
  ON public.feed_reactions FOR INSERT
  WITH CHECK (auth.uid() = player_id);

CREATE POLICY "feed_reactions_delete"
  ON public.feed_reactions FOR DELETE
  USING (auth.uid() = player_id);
