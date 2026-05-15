'use client'

import { useState, useTransition } from 'react'
import { resetPassword } from './actions'
import Link from 'next/link'

export default function ForgotPasswordPage() {
    const [isPending, startTransition] = useTransition()
    const [message, setMessage] = useState<string | null>(null)

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)

        startTransition(async () => {
            const res = await resetPassword(formData)
            if (res?.success) {
                setMessage('Password reset email sent! Check your inbox.')
            } else if (res?.error) {
                setMessage(res.error)
            }
        })
    }

    return (
        <main className="min-h-screen w-full bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-white flex items-center justify-center px-4">
            <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
                <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
                <p className="mt-2 text-sm text-white/60">
                    Enter your email and we’ll send a reset link.
                </p>

                {message ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/70">
                        {message}
                    </div>
                ) : null}

                <div className="mt-4">
                    <label htmlFor="email" className="mb-1 block text-xs font-medium text-white/70">
                        Email
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/10"
                    />
                </div>

                <button
                    type="submit"
                    disabled={isPending}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/15 disabled:opacity-60"
                >
                    {isPending ? 'Sending…' : 'Send reset link'}
                </button>

                <div className="mt-4 text-sm">
                    <Link
                        href="/login"
                        className="text-white/70 hover:text-white underline-offset-4 hover:underline"
                    >
                        Back to login
                    </Link>
                </div>
            </form>
        </main>
    )
}
