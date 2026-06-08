-- ============================================================
-- Invite Response Tracking
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- Add invite tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invite_token      uuid         DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS invite_response   text         CHECK (invite_response IN ('yes', 'no')),
  ADD COLUMN IF NOT EXISTS invite_response_at timestamptz;

-- Generate tokens for any existing profiles that don't have one
UPDATE public.profiles SET invite_token = gen_random_uuid() WHERE invite_token IS NULL;

-- ── RPC: submit_invite_response ───────────────────────────────
-- Called from the email yes/no link by unauthenticated users.
-- SECURITY DEFINER so it can update profiles without RLS bypass on the caller.
CREATE OR REPLACE FUNCTION public.submit_invite_response(
  p_token    uuid,
  p_response text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     uuid;
  v_name   text;
  v_status text;
BEGIN
  IF p_response NOT IN ('yes', 'no') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid response value');
  END IF;

  SELECT id, name, status
    INTO v_id, v_name, v_status
    FROM public.profiles
   WHERE invite_token = p_token;

  IF v_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired link');
  END IF;

  UPDATE public.profiles
     SET invite_response    = p_response,
         invite_response_at = now(),
         -- Only auto-drop on 'no'; leave 'yes' respondents at their current status
         status = CASE WHEN p_response = 'no' THEN 'dropped' ELSE v_status END
   WHERE id = v_id;

  RETURN json_build_object(
    'success',  true,
    'name',     v_name,
    'response', p_response
  );
END;
$$;

-- Allow anonymous (email link clicks) and authenticated users to call this
GRANT EXECUTE ON FUNCTION public.submit_invite_response(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_invite_response(uuid, text) TO authenticated;
