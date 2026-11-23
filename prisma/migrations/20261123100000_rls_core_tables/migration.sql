-- Defense-in-depth RLS for core identity tables.
-- Prisma sets session vars (see prisma-rls.middleware.ts).
-- Note: superuser / BYPASSRLS roles ignore policies until you use a restricted DB role.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenant_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_app_policy ON users;
CREATE POLICY users_app_policy ON users
  FOR ALL
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR id::text = current_setting('app.user_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR id::text = current_setting('app.user_id', true)
  );

DROP POLICY IF EXISTS refresh_tokens_app_policy ON refresh_tokens;
CREATE POLICY refresh_tokens_app_policy ON refresh_tokens
  FOR ALL
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR user_id::text = current_setting('app.user_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR user_id::text = current_setting('app.user_id', true)
  );

DROP POLICY IF EXISTS user_tenant_roles_app_policy ON user_tenant_roles;
CREATE POLICY user_tenant_roles_app_policy ON user_tenant_roles
  FOR ALL
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR user_id::text = current_setting('app.user_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR user_id::text = current_setting('app.user_id', true)
  );