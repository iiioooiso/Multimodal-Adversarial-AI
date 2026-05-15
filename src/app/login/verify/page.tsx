'use client'

import Link from "next/link"

export default function Verify() {
    return (
        <main className="min-h-screen w-full bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-white flex items-center justify-center px-4">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center shadow-2xl">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/30">
                    <span className="text-xl">📩</span>
                </div>

                <h3 className="text-xl font-semibold tracking-tight">Verify your email</h3>
                <p className="mt-2 text-sm text-white/60 leading-relaxed">
                    We sent a verification link to your inbox. Open it to activate your account.
                </p>

                <Link
                    href="/login"
                    className="mt-5 inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/15"
                >
                    Back to login
                </Link>
            </div>
        </main>
    )
}
