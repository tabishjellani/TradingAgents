-- ============================================================================
-- Migration 003: Auth Triggers and Defaults
-- Automatically initializes user profile when an account is created in auth.users.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email, role, daily_job_quota, created_at, updated_at)
    VALUES (
        new.id,
        COALESCE(new.email, 'unknown@example.com'),
        'user',
        20,
        now(),
        now()
    );

    -- Create a default watchlist for the new user
    INSERT INTO public.watchlists (user_id, name, is_default, created_at, updated_at)
    VALUES (new.id, 'My First Watchlist', true, now(), now());

    -- Create a default paper trading portfolio with $100,000 starting paper cash
    INSERT INTO public.portfolios (user_id, name, currency, initial_cash, current_cash, is_live, created_at, updated_at)
    VALUES (new.id, 'Default Paper Portfolio', 'USD', 100000.0000, 100000.0000, false, now(), now());

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger firing on every new auth user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
