'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/client'
import DashboardChat from '../components/DashboardChat'

import type { User } from '@supabase/supabase-js'

export default function DashboardPage() {
    const [loading, setLoading] = useState(true)
    const [user, setUser] = useState<User | null>(null)
    const router = useRouter()

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            if (!data.session?.user) {
                router.push('/login')
            } else {
                setUser(data.session.user)
            }
            setLoading(false)
        })

        const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
            if (!session?.user) {
                router.push('/login')
            } else {
                setUser(session.user)
            }
        })

        return () => {
            listener?.subscription?.unsubscribe()
        }
    }, [router])

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-white flex items-center justify-center">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/70">
                    Loading…
                </div>
            </div>
        )
    }

    return <>{user && <DashboardChat />}</>
}
