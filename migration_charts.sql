-- ============================================
-- MIGRATION: Add holdings table for portfolio tracking
-- Run in Supabase SQL Editor AFTER migration_fix_fk.sql
-- ============================================

CREATE TABLE IF NOT EXISTS public.holdings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    currency_id UUID REFERENCES public.currencies(id) ON DELETE CASCADE,
    shares INT DEFAULT 0,
    UNIQUE(user_id, currency_id)
);

ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own holdings" ON public.holdings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own holdings" ON public.holdings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own holdings" ON public.holdings FOR UPDATE USING (auth.uid() = user_id);
