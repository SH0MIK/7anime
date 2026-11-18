-- ==============================================================================
-- 7Anime — Supabase PostgreSQL Schema & Row Level Security (RLS) Setup
-- Project: 7anime_one (South Asia - Mumbai)
-- Execute this script in the Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. User Profiles Table (Linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone."
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile."
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile."
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- 3. Automatic Profile Creation on User Signup (GoTrue Trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'displayName', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', NULL)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Anime Watchlist Table
CREATE TABLE IF NOT EXISTS public.watchlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anime_id INTEGER NOT NULL,
  anime_title TEXT NOT NULL,
  poster_url TEXT,
  format TEXT,
  status TEXT NOT NULL CHECK (status IN ('watching', 'completed', 'plan_to_watch', 'dropped', 'on_hold')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_user_anime UNIQUE (user_id, anime_id)
);

-- Enable RLS on watchlist
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

-- Watchlist Policies
CREATE POLICY "Users can view their own watchlist."
  ON public.watchlist FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert into their own watchlist."
  ON public.watchlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watchlist entries."
  ON public.watchlist FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete from their own watchlist."
  ON public.watchlist FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Watch Progress & History Table
CREATE TABLE IF NOT EXISTS public.watch_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anime_id INTEGER NOT NULL,
  anime_title TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  progress_seconds INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_user_anime_episode UNIQUE (user_id, anime_id, episode_number)
);

-- Enable RLS on watch_history
ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;

-- Watch History Policies
CREATE POLICY "Users can view their own watch history."
  ON public.watch_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own watch progress."
  ON public.watch_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watch progress."
  ON public.watch_history FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own watch history."
  ON public.watch_history FOR DELETE
  USING (auth.uid() = user_id);
