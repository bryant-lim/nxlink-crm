-- Create the conversations table
CREATE TABLE public.conversations (
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users only
CREATE POLICY "Allow authenticated users to read conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (true);

-- Allow insert access via service role
CREATE POLICY "Allow service role to manage conversations"
ON public.conversations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
