'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { login } from './actions'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../utils/supabase/client'

import {
  Loader2,
  Mail,
  Lock,
  Github,
  ShieldCheck,
} from 'lucide-react'

function Logo() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
      <ShieldCheck className="h-[17px] w-[17px] text-white/90" />
    </div>
  )
}

export default function LoginPage() {
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1)
    return () => clearTimeout(timer)
  }, [])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const res = await login(formData)

      if (res?.success) {
        router.push('/dashboard')
      } else if (res?.error) {
        setErrorMsg(res.error)
      }
    })
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] text-white">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 text-sm text-white/60 backdrop-blur-xl">
          Loading...
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white">
      {/* subtle radial bg */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_28%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4">
        {/* NAVBAR */}
        <header className="mt-4 rounded-2xl border border-white/[0.08] bg-black/40 px-4 py-3 backdrop-blur-2xl">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <Logo />

              <div>
                <div className="text-sm font-semibold tracking-tight">
                  Multimodal Adversarial AI
                </div>

                <div className="text-[11px] text-white/40">
                  Verification Infrastructure
                </div>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-white/60 transition hover:bg-white/[0.05] hover:text-white md:inline-flex md:items-center md:gap-2"
              >
                <Github size={15} />
                GitHub
              </a>

              <Link
                href="/signup"
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
              >
                Sign up
              </Link>
            </div>
          </div>
        </header>

        {/* MAIN */}
        <section className="grid flex-1 items-center gap-14 py-10 md:grid-cols-[1fr_420px] md:py-14">
          {/* LEFT */}
          <div className="max-w-xl">
            <div className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-white/40">
              Enterprise AI Validation
            </div>

            <h1 className="mt-6 text-4xl font-semibold leading-[1.03] tracking-tight md:text-5xl">
              Verify AI outputs before execution.
            </h1>

            <p className="mt-6 max-w-lg text-[15px] leading-7 text-white/55">
              Multimodal Adversarial AI challenges generated responses through
              layered verification, feasibility analysis, and contradiction
              detection before teams commit deployment or operational decisions.
            </p>

            {/* minimal info */}
            <div className="mt-10 space-y-4 border-l border-white/[0.08] pl-5">
              <div>
                <div className="text-sm font-medium text-white/88">
                  Claim Extraction
                </div>

                <div className="mt-1 text-sm text-white/45">
                  Break generated outputs into verifiable reasoning steps.
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-white/88">
                  Feasibility Analysis
                </div>

                <div className="mt-1 text-sm text-white/45">
                  Validate decisions against operational constraints.
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-white/88">
                  Contradiction Detection
                </div>

                <div className="mt-1 text-sm text-white/45">
                  Surface hidden risks and unreliable assumptions.
                </div>
              </div>
            </div>
          </div>

          {/* LOGIN CARD */}
          <div className="w-full">
            <div className="rounded-[30px] border border-white/[0.08] bg-white/[0.04] p-6 shadow-2xl backdrop-blur-2xl md:p-7">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Welcome back
                </h2>

                <p className="mt-2 text-sm text-white/45">
                  Sign in to continue to your workspace.
                </p>
              </div>

              {errorMsg && (
                <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {errorMsg}
                </div>
              )}

              {/* GOOGLE */}
              <button
                type="button"
                onClick={async () => {
                  setErrorMsg(null)

                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                      redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
                    },
                  })

                  if (error) setErrorMsg(error.message)
                }}
                className="mt-7 flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] text-sm font-medium text-white/85 transition hover:bg-white/[0.05]"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>

                Continue with Google
              </button>

              {/* divider */}
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/[0.08]" />

                <div className="text-[11px] uppercase tracking-[0.16em] text-white/30">
                  Or continue
                </div>

                <div className="h-px flex-1 bg-white/[0.08]" />
              </div>

              {/* FORM */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-white/45">
                    Email
                  </label>

                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />

                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      placeholder="you@company.com"
                      className="h-12 w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/15 focus:bg-white/[0.05]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-white/45">
                    Password
                  </label>

                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />

                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      placeholder="••••••••"
                      className="h-12 w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/15 focus:bg-white/[0.05]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign in'
                  )}
                </button>
              </form>

              <div className="mt-6 flex items-center justify-between text-xs">
                <Link
                  href="/signup"
                  className="text-white/40 transition hover:text-white/75"
                >
                  Create account
                </Link>

                <Link
                  href="/forgot-password"
                  className="text-white/40 transition hover:text-white/75"
                >
                  Forgot password
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="border-t border-white/[0.06] py-5 text-xs text-white/30">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>© 2026 Multimodal Adversarial AI</div>

            <div>Human-first AI verification infrastructure</div>
          </div>
        </footer>
      </div>
    </main>
  )
}