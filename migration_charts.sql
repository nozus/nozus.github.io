-- ============================================
-- MIGRATION: Add holdings + icon system
-- Run in Supabase SQL Editor
-- ============================================

-- 1. Holdings table for trading
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

-- 2. Add equipped_icon to profiles (defaults to starter icon)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_icon TEXT DEFAULT 'nozus_default';

-- 3. Remove old avatar/banner columns (no longer used)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS avatar_url;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS banner_url;
