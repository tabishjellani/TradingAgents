-- ============================================================================
-- Migration 002: Row Level Security (RLS) Policies
-- Enforces tenant isolation and prevents cross-user reads, writes, and privilege escalation.
-- ============================================================================

-- 1. Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- 2. Profiles Policies
-- Users can view their own profile; admins can view all profiles
CREATE POLICY "Users can view own profile or admins view all"
ON public.profiles FOR SELECT
USING (auth.uid() = id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
));

-- Users cannot change their own role or daily quota; only non-privileged updates allowed
CREATE POLICY "Users can update own profile non-privileged fields"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND daily_job_quota = (SELECT daily_job_quota FROM public.profiles WHERE id = auth.uid())
);

-- 3. Watchlists Policies
CREATE POLICY "Users can manage own watchlists"
ON public.watchlists FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. Watchlist Items Policies (Checked via parent watchlist ownership)
CREATE POLICY "Users can manage own watchlist items"
ON public.watchlist_items FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.watchlists
    WHERE watchlists.id = watchlist_items.watchlist_id
    AND watchlists.user_id = auth.uid()
))
WITH CHECK (EXISTS (
    SELECT 1 FROM public.watchlists
    WHERE watchlists.id = watchlist_items.watchlist_id
    AND watchlists.user_id = auth.uid()
));

-- 5. Portfolios Policies
CREATE POLICY "Users can manage own portfolios"
ON public.portfolios FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 6. Positions Policies (Checked via parent portfolio ownership)
CREATE POLICY "Users can manage own positions"
ON public.positions FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE portfolios.id = positions.portfolio_id
    AND portfolios.user_id = auth.uid()
))
WITH CHECK (EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE portfolios.id = positions.portfolio_id
    AND portfolios.user_id = auth.uid()
));

-- 7. Orders Policies (Checked via parent portfolio ownership)
CREATE POLICY "Users can view and create own orders"
ON public.orders FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE portfolios.id = orders.portfolio_id
    AND portfolios.user_id = auth.uid()
))
WITH CHECK (EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE portfolios.id = orders.portfolio_id
    AND portfolios.user_id = auth.uid()
));

-- 8. Research Jobs Policies
CREATE POLICY "Users can view and submit own research jobs"
ON public.research_jobs FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 9. Research Reports Policies
CREATE POLICY "Users can view and persist own research reports"
ON public.research_reports FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 10. Backtest Runs Policies
CREATE POLICY "Users can view and manage own backtests"
ON public.backtest_runs FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 11. Alert Rules Policies
CREATE POLICY "Users can view and manage own alerts"
ON public.alert_rules FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 12. Notifications Policies
CREATE POLICY "Users can view and dismiss own notifications"
ON public.notifications FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 13. Usage Ledger Policies (Read own usage, insert via server)
CREATE POLICY "Users can view own usage ledger"
ON public.usage_ledger FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service can insert usage records"
ON public.usage_ledger FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 14. Audit Events Policies (Admins can view, authenticated can log events)
CREATE POLICY "Admins can view audit events"
ON public.audit_events FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
));

CREATE POLICY "Authenticated users and service can insert audit events"
ON public.audit_events FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);
