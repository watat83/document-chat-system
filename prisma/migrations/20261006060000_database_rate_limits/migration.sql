CREATE TABLE public.rate_limit_counters (
  key text PRIMARY KEY,
  count integer NOT NULL CHECK (count > 0),
  "resetAt" timestamptz NOT NULL
);
CREATE INDEX rate_limit_counters_reset_at_idx ON public.rate_limit_counters ("resetAt");
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_counters FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.rate_limit_counters FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.rate_limit_counters FROM authenticated;
  END IF;
END $$;
