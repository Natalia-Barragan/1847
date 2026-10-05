import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.warn('1847 - parrilla & cerveceria WARNING: NEXT_PUBLIC_SUPABASE_URL no está configurada. Usando placeholders para la compilación.')
}

// Cliente público estándar (respeta Políticas de Seguridad / RLS)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
})

// Cliente administrador (pasa por alto RLS, ideal para operaciones internas de POS, KDS y Caja en Server Actions)
export const supabaseAdmin = createClient<Database>(
  supabaseUrl,
  supabaseServiceKey || supabaseAnonKey,
  {
    auth: {
      persistSession: false,
    },
  }
)
