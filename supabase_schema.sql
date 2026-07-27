-- Create the conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT,
    phone_number TEXT,
    email_address TEXT,
    customer_sentiment TEXT,
    company_name TEXT,
    conversation_summary TEXT,
    conversation_date DATE,
    conversation_time TIME,
    conversation_tags TEXT[],
    conversation_transcript TEXT,
    next_steps TEXT,
    call_audio_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read conversations" ON public.conversations;
DROP POLICY IF EXISTS "Allow service role to manage conversations" ON public.conversations;

CREATE POLICY "Allow authenticated users to read conversations"
ON public.conversations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow service role to manage conversations"
ON public.conversations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 1. Create profiles table for user management & roles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL, -- Display Name used within the system
    mobile TEXT,
    role TEXT NOT NULL DEFAULT 'support', -- 'admin', 'support', 'sales'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Remove foreign key constraint to auth.users if it exists from default Supabase starter templates
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop old recursive policies to prevent "infinite recursion" error
DROP POLICY IF EXISTS "Allow authenticated users to read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated users to insert or update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow admins to manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated users to manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow service role to manage profiles" ON public.profiles;

-- Clean non-recursive policies for profiles
CREATE POLICY "Allow authenticated users to manage profiles"
ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role to manage profiles"
ON public.profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Create the tickets table with category & assignee columns
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    customer_phone TEXT,
    customer_name TEXT,
    company_name TEXT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'Support', -- 'Support', 'Sales-Follow Up', 'Billing', 'Bug Report', 'Emergency'
    priority TEXT NOT NULL DEFAULT 'medium', -- 'urgent', 'high', 'medium', 'low'
    status TEXT NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'pending_customer', 'resolved', 'closed'
    assigned_to_role TEXT DEFAULT 'support_manager',
    assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_user_name TEXT,
    first_response_due_at TIMESTAMP WITH TIME ZONE,
    resolution_due_at TIMESTAMP WITH TIME ZONE,
    responded_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to manage tickets" ON public.tickets;
DROP POLICY IF EXISTS "Allow service role to manage tickets" ON public.tickets;

CREATE POLICY "Allow authenticated users to manage tickets"
ON public.tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role to manage tickets"
ON public.tickets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Create ticket_activity_logs table for audit trail
CREATE TABLE IF NOT EXISTS public.ticket_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    actor_name TEXT NOT NULL,
    action_type TEXT NOT NULL, -- 'owner_changed', 'status_changed', 'priority_changed', 'category_changed'
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.ticket_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to manage activity logs" ON public.ticket_activity_logs;
DROP POLICY IF EXISTS "Allow service role to manage activity logs" ON public.ticket_activity_logs;

CREATE POLICY "Allow authenticated users to manage activity logs"
ON public.ticket_activity_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role to manage activity logs"
ON public.ticket_activity_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Create ticket_notes table for internal remarks
CREATE TABLE IF NOT EXISTS public.ticket_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    note_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.ticket_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to manage ticket notes" ON public.ticket_notes;
DROP POLICY IF EXISTS "Allow service role to manage ticket notes" ON public.ticket_notes;

CREATE POLICY "Allow authenticated users to manage ticket notes"
ON public.ticket_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role to manage ticket notes"
ON public.ticket_notes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Create customer_profiles table for consolidation
CREATE TABLE IF NOT EXISTS public.customer_profiles (
    phone_number TEXT PRIMARY KEY,
    customer_name TEXT,
    company_name TEXT,
    email_address TEXT,
    health_score INTEGER DEFAULT 100,
    health_status TEXT DEFAULT 'excellent',
    account_status TEXT DEFAULT 'lead',
    conversion_rate NUMERIC DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read and update customer profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow service role to manage customer profiles" ON public.customer_profiles;

CREATE POLICY "Allow authenticated users to read and update customer profiles"
ON public.customer_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role to manage customer profiles"
ON public.customer_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Enable RLS permissions for profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated and service role to manage profiles" ON public.profiles;

CREATE POLICY "Allow authenticated and service role to manage profiles"
ON public.profiles FOR ALL USING (true) WITH CHECK (true);

