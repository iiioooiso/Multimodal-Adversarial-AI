import Link from 'next/link'
import { ArrowRight, Bot, Clock3, ShieldCheck, Target } from 'lucide-react'

const workflow = [
  'AI Response',
  'Claim Extraction',
  'Feasibility Verification',
  'Risk + Contradiction Detection',
  'Final Verdict',
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4">
        <header className="sticky top-0 z-20 mt-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <ShieldCheck size={16} className="text-white/85" />
              </div>
              <div>
                <div className="text-sm font-semibold tracking-tight">Multimodal Adversarial AI</div>
                <div className="text-[11px] text-white/45">Verification Layer for AI decisions</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Link
                href="/login"
                className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 font-medium text-white/90 hover:bg-white/15"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="rounded-xl border border-white/20 bg-white px-4 py-2 font-semibold text-black hover:bg-white/90"
              >
                Sign up
              </Link>
            </div>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-8 py-12 md:grid-cols-2 md:py-16">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              <Bot size={13} />
              Built for practical, high-stakes decisions
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              Stop wasting time on AI answers that only sound smart.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65 md:text-base">
              Multimodal Adversarial AI challenges generated solutions before you execute. It extracts key claims,
              tests real feasibility, exposes hidden assumptions, and produces a final confidence verdict so teams can
              decide faster with less risk.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
              >
                Get Started
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center rounded-xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-medium text-white/85 hover:bg-white/15"
              >
                Open Dashboard
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm font-semibold text-white/90">Verification Workflow</div>
            <div className="mt-1 text-xs text-white/50">Decision diagram</div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {workflow.map((step, idx) => (
                <div key={step} className="flex items-center gap-2">
                  <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80">
                    {step}
                  </div>
                  {idx !== workflow.length - 1 ? <span className="text-white/30">→</span> : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 pb-10 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <Clock3 size={18} className="text-white/75" />
            <div className="mt-3 text-sm font-semibold">Saves execution time</div>
            <p className="mt-2 text-sm text-white/60">
              Filter weak plans early and focus only on options that can actually work.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <Target size={18} className="text-white/75" />
            <div className="mt-3 text-sm font-semibold">Faster decisions</div>
            <p className="mt-2 text-sm text-white/60">
              Confidence scoring and risk summaries make tradeoffs obvious for teams.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <ShieldCheck size={18} className="text-white/75" />
            <div className="mt-3 text-sm font-semibold">Reduced hallucination risk</div>
            <p className="mt-2 text-sm text-white/60">
              Contradiction checks and assumption tracking prevent overconfident AI output.
            </p>
          </div>
        </section>

        <footer className="mb-4 border-t border-white/10 py-5 text-xs text-white/45">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>© 2026 Multimodal Adversarial AI</div>
            <div>Human-first AI verification for practical outcomes</div>
          </div>
        </footer>
      </div>
    </main>
  )
}
