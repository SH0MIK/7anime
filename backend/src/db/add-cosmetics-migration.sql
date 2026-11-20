-- Migration: Add Profile Customization (Avatar Decorations and Banner Effects)
-- Target: public.profiles table in Supabase PostgreSQL

-- 1. Ensure avatar_decoration column exists
ALTER TABLE IF EXISTS public.profiles
ADD COLUMN IF NOT EXISTS avatar_decoration TEXT DEFAULT 'none';

-- 2. Ensure banner_effect column exists
ALTER TABLE IF EXISTS public.profiles
ADD COLUMN IF NOT EXISTS banner_effect TEXT DEFAULT 'none';

-- 3. Ensure banner_url column exists (for custom/animated banner backgrounds)
ALTER TABLE IF EXISTS public.profiles
ADD COLUMN IF NOT EXISTS banner_url TEXT;

-- 4. Ensure frame_style column exists (for backwards compatibility)
ALTER TABLE IF EXISTS public.profiles
ADD COLUMN IF NOT EXISTS frame_style TEXT DEFAULT 'none';

-- 5. Add index on cosmetics columns if querying profiles by style
CREATE INDEX IF NOT EXISTS idx_profiles_avatar_decoration ON public.profiles (avatar_decoration);
CREATE INDEX IF NOT EXISTS idx_profiles_banner_effect ON public.profiles (banner_effect);

-- 6. Optional: username glow colour and visibility settings
ALTER TABLE IF EXISTS public.profiles
ADD COLUMN IF NOT EXISTS username_glow TEXT;

ALTER TABLE IF EXISTS public.profiles
ADD COLUMN IF NOT EXISTS visibility JSONB DEFAULT '{"publicProfile": true, "showComments": true, "showLibrary": true, "showSocial": true}'::jsonb;

-- Comment documentation
COMMENT ON COLUMN public.profiles.avatar_decoration IS 'Selected avatar decoration cosmetic ID (e.g., neon-halo, sakura-drift, royal-crown)';
COMMENT ON COLUMN public.profiles.banner_effect IS 'Selected banner effect cosmetic ID (e.g., sakura, snowfall, aurora, thunderstorm)';
COMMENT ON COLUMN public.profiles.banner_url IS 'Custom banner image or animated GIF/WebP URL';
