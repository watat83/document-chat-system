-- Clerk authorization is enforced in tenant-scoped server routes using Prisma.
-- Browser Supabase roles must not read or mutate the application's server tables.
DO $$
DECLARE
  table_name text;
  role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ab_test_results', 'ab_test_variants', 'ab_tests', 'account_deletion_audits', 'account_deletions', 'activities', 'ai_alerts', 'ai_cost_optimizations', 'ai_metrics', 'ai_provider_status', 'ai_routing_configs', 'api_keys', 'audit_log_exports', 'audit_log_retention', 'audit_logs', 'batch_processing', 'billing_events', 'conversations', 'documents', 'folders', 'notification_preferences', 'notification_user_statuses', 'notifications', 'organization_settings', 'organizations', 'pricing_plans', 'profiles', 'saved_searches', 'security_incidents', 'subscriptions', 'usage_events', 'usage_migrations', 'usage_records', 'users']
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
      LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;
