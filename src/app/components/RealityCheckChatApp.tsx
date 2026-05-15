"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/client";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  LogOut,
  Send,
  Shield,
  XCircle,
} from "lucide-react";

type Provider = "openrouter" | "gemini";

type CritiqVerdict = "Proceed" | "Proceed with Caution" | "Not Recommended";

type CritiqResult = {
  verdict: CritiqVerdict;
  confidence: number;
  feasibilityScore: number;
  summary: string;
  keyClaims: Array<{
    claim: string;
    domain:
      | "technical"
      | "economic"
      | "timeline"
      | "legal"
      | "operational"
      | "unknown";
    assumptions: string[];
  }>;
  contradictions: string[];
  risks: Array<{
    title: string;
    severity: "low" | "medium" | "high";
    whyItMatters: string;
    mitigation: string;
  }>;
  missingInfo: string[];
  recommendedNextSteps: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

type ChatTurn =
  | { role: "user"; content: string; at: number }
  | {
      role: "assistant";
      content: string;
      at: number;
      responseTimeMs?: number;
      critiq?: CritiqResult;
    };

const STORAGE_KEYS = {
  provider: "rc_provider",
  openrouter: "rc_openrouter_key",
  gemini: "rc_gemini_key",
} as const;

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function percent(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function verdictTone(verdict: CritiqVerdict) {
  switch (verdict) {
    case "Proceed":
      return {
        label: "Proceed",
        icon: CheckCircle2,
        badge: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
        ring: "ring-emerald-500/20",
      };
    case "Not Recommended":
      return {
        label: "Not Recommended",
        icon: XCircle,
        badge: "bg-rose-500/15 text-rose-200 border-rose-500/30",
        ring: "ring-rose-500/20",
      };
    default:
      return {
        label: "Proceed with Caution",
        icon: AlertTriangle,
        badge: "bg-amber-500/15 text-amber-200 border-amber-500/30",
        ring: "ring-amber-500/20",
      };
  }
}

function severityPill(sev: "low" | "medium" | "high") {
  if (sev === "high") return "bg-rose-500/15 text-rose-200 border-rose-500/30";
  if (sev === "low") return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
  return "bg-amber-500/15 text-amber-200 border-amber-500/30";
}

function ProgressBar({ value, tone }: { value: number; tone: "good" | "mid" | "bad" }) {
  const pct = percent(value);
  const barTone =
    tone === "good"
      ? "from-emerald-500/80 to-emerald-400/60"
      : tone === "bad"
        ? "from-rose-500/80 to-rose-400/60"
        : "from-amber-500/80 to-amber-400/60";

  return (
    <div className="h-2 rounded-full bg-white/5 border border-white/10 overflow-hidden">
      <div
        className={`h-full bg-gradient-to-r ${barTone}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
      aria-label="Copy"
    >
      <Copy size={14} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function MaskedInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-white/70">{label}</div>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/10"
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );
}

export default function MultimodalAdversarialApp() {
  const [provider, setProvider] = useState<Provider>("openrouter");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");

  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    const savedProvider = (window.localStorage.getItem(STORAGE_KEYS.provider) || "") as Provider;
    if (savedProvider === "openrouter" || savedProvider === "gemini") setProvider(savedProvider);

    const ok = window.localStorage.getItem(STORAGE_KEYS.openrouter);
    const gk = window.localStorage.getItem(STORAGE_KEYS.gemini);
    if (ok) setOpenrouterKey(ok);
    if (gk) setGeminiKey(gk);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.provider, provider);
  }, [provider]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.openrouter, openrouterKey);
  }, [openrouterKey]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.gemini, geminiKey);
  }, [geminiKey]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns, isLoading]);

  const activeKey = provider === "openrouter" ? openrouterKey : geminiKey;

  const providerLabel = useMemo(() => {
    return provider === "openrouter" ? "OpenRouter" : "Gemini";
  }, [provider]);

  async function send() {
    const prompt = draft.trim();
    if (!prompt || isLoading) return;

    setError(null);

    const apiKey = activeKey.trim();
    if (!apiKey) {
      setError(`Add your ${providerLabel} API key to start chatting.`);
      return;
    }

    const userTurn: ChatTurn = { role: "user", content: prompt, at: Date.now() };
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setDraft("");

    setIsLoading(true);

    try {
      const messages = nextTurns.map((t) => ({
        role: t.role,
        content: t.content,
      }));

      const res = await fetch("/compare-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          apiKey,
          prompt,
          messages,
        }),
      });

      const dataUnknown = (await res.json().catch(() => null)) as unknown;
      const data = isRecord(dataUnknown) ? dataUnknown : {};
      if (!res.ok) {
        const err = typeof data.error === "string" ? data.error : "Request failed";
        throw new Error(err);
      }

      const assistantTurn: ChatTurn = {
        role: "assistant",
        content: typeof data.answer === "string" ? data.answer : "(empty)",
        at: Date.now(),
        responseTimeMs: typeof data.responseTimeMs === "number" ? data.responseTimeMs : undefined,
        critiq: isRecord(data.critiq) ? (data.critiq as unknown as CritiqResult) : undefined,
      };

      setTurns((prev) => [...prev, assistantTurn]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5">
        <header className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <Shield size={18} className="text-white/85" />
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight">Multimodal Adversarial AI</div>
                <div className="text-xs text-white/60">
                  Professional AI verification: claims → feasibility → risks → final verdict
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-end">
              <div className="flex items-center gap-2">
                <Link
                  href="/"
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-white/75 hover:text-white"
                >
                  Onboarding
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-white/75 hover:text-white"
                >
                  <LogOut size={12} />
                  Sign out
                </button>
              </div>

              <div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
                <button
                  type="button"
                  onClick={() => setProvider("openrouter")}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    provider === "openrouter" ? "bg-white/10 text-white" : "text-white/60 hover:text-white"
                  }`}
                >
                  OpenRouter
                </button>
                <button
                  type="button"
                  onClick={() => setProvider("gemini")}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    provider === "gemini" ? "bg-white/10 text-white" : "text-white/60 hover:text-white"
                  }`}
                >
                  Gemini
                </button>
              </div>

              <div className="w-full md:w-[320px]">
                {provider === "openrouter" ? (
                  <MaskedInput
                    label="OpenRouter API Key"
                    value={openrouterKey}
                    onChange={setOpenrouterKey}
                    placeholder="sk-or-..."
                  />
                ) : (
                  <MaskedInput
                    label="Gemini API Key"
                    value={geminiKey}
                    onChange={setGeminiKey}
                    placeholder="AIza..."
                  />
                )}
                <div className="mt-1 text-[11px] text-white/40">
                  Stored locally in your browser (localStorage).
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-4 flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable]"
          >
            {turns.length === 0 ? (
              <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-white/10 bg-black/20 p-6">
                <div className="text-sm font-semibold text-white/90">What this does</div>
                <div className="mt-2 text-sm leading-relaxed text-white/65">
                  Ask anything. The AI answers, then CRITIQ extracts key claims and challenges them against
                  feasibility, real-world constraints, contradictions, and hidden assumptions.
                </div>
                <div className="mt-4 text-xs text-white/50">
                  Tip: include budget, timeline, and operational constraints for a sharper verdict.
                </div>
              </div>
            ) : null}

            <div className="space-y-4">
              {turns.map((t, idx) => {
                const isUser = t.role === "user";
                return (
                  <div key={`${t.at}-${idx}`} className={isUser ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={`max-w-[860px] rounded-2xl border px-4 py-3 ${
                        isUser
                          ? "border-white/10 bg-white/10"
                          : "border-white/10 bg-black/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm whitespace-pre-wrap leading-relaxed text-white/90">
                          {t.content}
                        </div>
                        {!isUser ? <CopyButton text={t.content} /> : null}
                      </div>

                      {t.role === "assistant" && t.critiq ? (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                          <CritiqCard critiq={t.critiq} responseTimeMs={t.responseTimeMs} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {isLoading ? (
                <div className="flex justify-start">
                  <div className="max-w-[860px] rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-white/70">
                      <Loader2 className="animate-spin" size={16} />
                      Generating answer and running CRITIQ…
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t border-white/10 bg-black/20 p-3">
            {error ? (
              <div className="mb-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask something…"
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/10"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={isLoading}
                className="inline-flex h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white/90 hover:bg-white/15 disabled:opacity-60"
              >
                <Send size={16} />
                Send
              </button>
            </div>
            <div className="mt-2 text-[11px] text-white/40">
              Enter to send • Shift+Enter for newline
            </div>
          </div>
        </div>

        <footer className="mt-4 border-t border-white/10 py-4 text-xs text-white/40">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>© 2026 Multimodal Adversarial AI</div>
            <div>Human-centric startup UX • Modern dark interface</div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function CritiqCard({ critiq, responseTimeMs }: { critiq: CritiqResult; responseTimeMs?: number }) {
  const tone = verdictTone(critiq.verdict);
  const VerdictIcon = tone.icon;

  const confidenceTone = critiq.confidence >= 70 ? "good" : critiq.confidence <= 40 ? "bad" : "mid";
  const feasibilityTone = critiq.feasibilityScore >= 70 ? "good" : critiq.feasibilityScore <= 40 ? "bad" : "mid";

  const confidencePct = clamp01(percent(critiq.confidence) / 100);
  const feasibilityPct = clamp01(percent(critiq.feasibilityScore) / 100);

  return (
    <div className={`rounded-2xl ring-1 ${tone.ring}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl border ${tone.badge}`}>
            <VerdictIcon size={18} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold tracking-tight">CRITIQ · Adversarial Audit</div>
              <div className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${tone.badge}`}>
                {tone.label}
              </div>
              {typeof responseTimeMs === "number" ? (
                <div className="text-[11px] text-white/45">{Math.round(responseTimeMs)}ms</div>
              ) : null}
            </div>
            {critiq.summary ? (
              <div className="mt-1 text-sm leading-relaxed text-white/70">{critiq.summary}</div>
            ) : null}
          </div>
        </div>

        <div className="grid w-full gap-3 md:w-[360px]">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <div>Confidence</div>
              <div className="text-white/80">{percent(critiq.confidence)}%</div>
            </div>
            <div className="mt-2">
              <ProgressBar value={percent(critiq.confidence)} tone={confidenceTone} />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <div>Feasibility</div>
              <div className="text-white/80">{percent(critiq.feasibilityScore)}%</div>
            </div>
            <div className="mt-2">
              <ProgressBar value={percent(critiq.feasibilityScore)} tone={feasibilityTone} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] text-white/60">Key claims</div>
              <div className="mt-1 text-sm font-semibold text-white/85">
                {critiq.keyClaims?.length ?? 0}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] text-white/60">Risks</div>
              <div className="mt-1 text-sm font-semibold text-white/85">
                {critiq.risks?.length ?? 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Section title="Key Claims" subtitle="What the answer implicitly promises">
          {critiq.keyClaims?.length ? (
            <ul className="space-y-2">
              {critiq.keyClaims.map((c, i) => (
                <li key={i} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium text-white/85">{c.claim}</div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/60">
                      {c.domain}
                    </span>
                  </div>
                  {c.assumptions?.length ? (
                    <div className="mt-2 text-xs text-white/55">
                      Assumptions: {c.assumptions.join(" · ")}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyLine text="No explicit claims extracted." />
          )}
        </Section>

        <Section title="Risks" subtitle="Failure modes + mitigations">
          {critiq.risks?.length ? (
            <ul className="space-y-2">
              {critiq.risks.map((r, i) => (
                <li key={i} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white/85">{r.title}</div>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${severityPill(r.severity)}`}>
                      {r.severity}
                    </span>
                  </div>
                  {r.whyItMatters ? (
                    <div className="mt-2 text-xs text-white/60">
                      <span className="text-white/50">Why:</span> {r.whyItMatters}
                    </div>
                  ) : null}
                  {r.mitigation ? (
                    <div className="mt-1 text-xs text-white/60">
                      <span className="text-white/50">Mitigation:</span> {r.mitigation}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyLine text="No risks listed." />
          )}
        </Section>

        <Section title="Contradictions" subtitle="Internal conflicts / logical breaks">
          {critiq.contradictions?.length ? (
            <ul className="space-y-2">
              {critiq.contradictions.map((x, i) => (
                <li key={i} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/75">
                  {x}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyLine text="No contradictions detected." />
          )}
        </Section>

        <Section title="What’s Missing" subtitle="Info needed before this is real">
          {critiq.missingInfo?.length ? (
            <ul className="space-y-2">
              {critiq.missingInfo.map((x, i) => (
                <li key={i} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/75">
                  {x}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyLine text="No missing info listed." />
          )}
        </Section>

        <div className="md:col-span-2">
          <Section title="Next Steps" subtitle="How to de-risk quickly">
            {critiq.recommendedNextSteps?.length ? (
              <ul className="grid gap-2 md:grid-cols-2">
                {critiq.recommendedNextSteps.map((x, i) => (
                  <li key={i} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/75">
                    {x}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyLine text="No next steps provided." />
            )}

            <div className="mt-3 text-[11px] text-white/40">
              Note: This is an automated plausibility check. Treat it as a risk lens, not ground truth.
            </div>
          </Section>
        </div>
      </div>

      {/* quiet little “signal” bars for quick glance */}
      <div className="mt-4 flex items-center gap-3 text-[11px] text-white/45">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/25" />
          Confidence {Math.round(confidencePct * 100)}%
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/25" />
          Feasibility {Math.round(feasibilityPct * 100)}%
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white/90">{title}</div>
          <div className="mt-0.5 text-[11px] text-white/45">{subtitle}</div>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/55">
      {text}
    </div>
  );
}
