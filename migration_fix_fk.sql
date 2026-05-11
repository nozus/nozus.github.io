-- ============================================
-- MIGRATION: Fix FK constraints + add auto-profile trigger
-- Run this in your Supabase SQL Editor NOW
-- ============================================

-- 1. Drop the old foreign key on currencies.creator_id
ALTER TABLE public.currencies DROP CONSTRAINT IF EXISTS currencies_creator_id_fkey;

-- 2. Re-add it pointing to auth.users instead of profiles
ALTER TABLE public.currencies
    ADD CONSTRAINT currencies_creator_id_fkey
    FOREIGN KEY (creator_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Fix transactions.user_id FK too (same issue)
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;
ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 4. Drop the bio column (no longer used)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS bio;

-- 5. Auto-create profile on signup so FK never fails
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, points)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || LEFT(NEW.id::text, 8)),
        1000
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 6. Create the storage bucket for profile images (run once)
-- NOTE: You also need to create the 'avatars' bucket in the
-- Supabase Dashboard > Storage, and set it to PUBLIC.
