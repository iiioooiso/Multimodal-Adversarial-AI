'use server'

import { createClient } from '../../../utils/supabase/server'
import { redirect } from 'next/navigation'

/**
 * Login (password OR magic link)
 */
export async function login(formData: FormData) {
    const supabase = await createClient()
    const email = formData.get('email') as string
    const password = formData.get('password') as string | null

    if (password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) return { success: false, error: error.message }
        return { success: true }
    }

    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/?next=/dashboard` },
    })
    if (error) return { success: false, error: error.message }
    return { success: true, otp: true }
}

export async function signup(formData: FormData) {
    const supabase = await createClient()
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}?next=/dashboard`,
        },
    })

    if (error) {
        return { success: false, error: error.message }
    }

    redirect('/login/verify')
}
