import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail-safe para não travar o carregamento do React caso falte configurar as envs no Vercel
export const supabase = (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')) 
    ? createClient(supabaseUrl, supabaseAnonKey) 
    : { 
        from: () => ({ 
            select: () => ({ 
                order: () => Promise.resolve({ data: [], error: null }),
                eq: () => Promise.resolve({ data: [], error: null })
            }),
            insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }),
            upsert: () => Promise.resolve({ error: null })
        }) 
    };
