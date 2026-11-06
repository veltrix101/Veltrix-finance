-- Applied to the existing finance_data table to enforce optimistic concurrency.
ALTER TABLE public.finance_data ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0);

CREATE FUNCTION public.guard_finance_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.revision <> 0 THEN
      RAISE EXCEPTION 'A new workspace must start at revision zero' USING ERRCODE = '40001';
    END IF;
  ELSIF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Workspace changed. Reload the latest version before saving.' USING ERRCODE = '40001';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_finance_revision() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER finance_revision_guard BEFORE INSERT OR UPDATE ON public.finance_data
FOR EACH ROW EXECUTE FUNCTION public.guard_finance_revision();
