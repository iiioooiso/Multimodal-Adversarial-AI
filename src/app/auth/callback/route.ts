import { type NextRequest } from 'next/server'
import { redirect } from 'next/navigation'

import { createClient } from '../../../../utils/supabase/server'

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/dashboard'

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            redirect(next)
        }
    }

    redirect('/error')
}
