import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const SUPABASE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_FUNCTION_URL as string

// ── Types ──────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  created_at: string
  last_sign_in_at: string | null
  confirmed_at: string | null
}

export interface Business {
  id: string
  owner_id: string
  name: string
  description: string | null
  contact_email: string | null
  contact_phone: string | null
  whatsapp_number: string | null
  website_url: string | null
  address: string | null
  lat: number | null
  lon: number | null
  categories: string[]
  is_active: boolean
  is_featured?: boolean
  logo_url: string | null
  created_at: string
  updated_at: string
  // Joined field from user_profiles
  owner_email?: string
  owner_first_name?: string
  owner_last_name?: string
}

export interface Subscription {
  id: number
  user_id: string
  payfast_token: string | null
  status: 'active' | 'paused' | 'cancelled' | 'failed'
  amount: number | null
  plan_name: string | null
  next_run_date: string | null
  created_at: string
}
