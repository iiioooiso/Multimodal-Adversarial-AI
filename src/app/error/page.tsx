'use client'

import Link from 'next/link'

export default function ErrorPage() {
    return (
        <main className="min-h-screen w-full bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-white flex items-center justify-center px-4">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="text-lg font-semibold tracking-tight">Authentication error</div>
                <div className="mt-2 text-sm text-white/60">
                    Sign-in couldn&apos;t be completed. This can happen if the link expired, the OAuth flow was cancelled,
                    or the redirect URL doesn&apos;t match your Supabase settings.
                </div>
                <div className="mt-5 flex items-center gap-3">
                    <Link
                        href="/login"
                        className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/15"
                    >
                        Back to login
                    </Link>
                    <Link
                        href="/"
                        className="text-sm text-white/60 hover:text-white underline-offset-4 hover:underline"
                    >
                        Home
                    </Link>
                </div>
            </div>
        </main>
    );
}