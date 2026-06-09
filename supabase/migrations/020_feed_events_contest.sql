-- Extend the event_type check to include 'contest' entries from CTP / LD submissions
ALTER TABLE public.feed_events
  DROP CONSTRAINT feed_events_event_type_check;

ALTER TABLE public.feed_events
  ADD CONSTRAINT feed_events_event_type_check
  CHECK (event_type IN ('score', 'chulligan', 'putt', 'contest'));
