-- ============================================
-- MIGRATION: Fix FK constraints + Storage RLS + Auto-profile
-- Run this ENTIRE script in your Supabase SQL Editor
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

-- ============================================
-- 6. STORAGE RLS POLICIES for the 'avatars' bucket
-- These allow authenticated users to upload/update/read
-- their own files (stored under their user ID folder).
-- ============================================

-- Allow authenticated users to upload files into their own folder
CREATE POLICY "Users can upload their own avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update/overwrite their own files
CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow anyone to read avatar files (public profile images)
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Allow users to delete their own avatar files
CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);
