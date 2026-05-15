"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/client";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  CornerUpRight,
  Flag,
  Github,
  LogOut,
  Menu,
  Plus,
  Send,
  Users,
  X,
  XCircle,
  Zap,
  Shield,
  Sparkles,
} from "lucide-react";

type Provider = "openrouter" | "gemini";

type CritiqVerdict =
  | "Proceed"
  | "Proceed with Caution"
  | "Not Recommended";

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

type ChatTurn =
  | {
      id?: string;
      role: "user";
      content: string;
      at: number;
    }
  | {
      id?: string;
      role: "assistant";
      content: string;
      at: number;
      responseTimeMs?: number;
      critiq?: CritiqResult;
      agenticSteps?: string[];
      streaming?: boolean;
    };

type ConversationSummary = {
  id: string;
  title: string;
  provider: Provider;
  updatedAt: string;
  createdAt: string;
};

const STORAGE_KEYS = {
  provider: "maa_provider",
  openrouter: "maa_openrouter_key",
  gemini: "maa_gemini_key",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
        badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      };
    case "Not Recommended":
      return {
        label: "Not Recommended",
        icon: XCircle,
        badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      };
    default:
      return {
        label: "Proceed with Caution",
        icon: AlertTriangle,
        badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      };
  }
}

export default function MultimodalAdversarialDashboard() {
  const [provider, setProvider] = useState<Provider>("openrouter");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [draft, setDraft] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agenticSteps, setAgenticSteps] = useState<string[]>([]);
  const [activeAgentStep, setActiveAgentStep] = useState(0);
  const [copiedTurn, setCopiedTurn] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [reportedTurn, setReportedTurn] = useState<number | null>(null);
  const [thinkingStream, setThinkingStream] = useState("");
  const [isStreamingThinking, setIsStreamingThinking] = useState(false);
  const [liveAssistantMessage, setLiveAssistantMessage] = useState("");
  const [isStreamingAnswer, setIsStreamingAnswer] = useState(false);

  const chatRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const answerStreamStartedRef = useRef(false);
  const router = useRouter();

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const savedProvider = (
      window.localStorage.getItem(STORAGE_KEYS.provider) || ""
    ) as Provider;
    if (savedProvider === "openrouter" || savedProvider === "gemini") {
      setProvider(savedProvider);
    }
    const ok = window.localStorage.getItem(STORAGE_KEYS.openrouter);
    const gk = window.localStorage.getItem(STORAGE_KEYS.gemini);
    if (ok) setOpenrouterKey(ok);
    if (gk) setGeminiKey(gk);
  }, []);

  useEffect(() => {
    setApiKeyDraft(provider === "openrouter" ? openrouterKey : geminiKey);
    setIsEditingKey(false);
  }, [provider, openrouterKey, geminiKey]);

  useEffect(() => {
    void loadConversations(true);
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
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [turns, isLoading, liveAssistantMessage, thinkingStream, isStreamingAnswer]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
  }, [draft]);

  useEffect(() => {
    if (!isLoading || agenticSteps.length === 0) {
      setActiveAgentStep(0);
      return;
    }
    const id = window.setInterval(() => {
      setActiveAgentStep((current) =>
        Math.min(current + 1, agenticSteps.length - 1)
      );
    }, 1300);
    return () => window.clearInterval(id);
  }, [agenticSteps.length, isLoading]);

  const activeKey = provider === "openrouter" ? openrouterKey : geminiKey;
  const providerLabel = provider === "openrouter" ? "OpenRouter" : "Gemini";
  const hasActiveKey = Boolean(activeKey.trim());

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function setApiKey() {
    const key = apiKeyDraft.trim();
    if (!key) {
      setError(`Enter a valid ${providerLabel} API key.`);
      return;
    }
    if (provider === "openrouter") setOpenrouterKey(key);
    else setGeminiKey(key);
    setIsEditingKey(false);
    setError(null);
  }

  function handleApiKeyAction() {
    if (hasActiveKey && !isEditingKey) {
      setIsEditingKey(true);
      setApiKeyDraft("");
      setError(`Enter a new ${providerLabel} API key, then click Save.`);
      return;
    }
    setApiKey();
  }

  async function getCurrentUserId() {
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) {
      throw new Error("You are not authenticated.");
    }
    return data.user.id;
  }

  function upsertConversationSummary(summary: ConversationSummary) {
    setConversations((prev) => {
      const filtered = prev.filter((item) => item.id !== summary.id);
      return [summary, ...filtered];
    });
  }

  async function openConversation(conversationId: string, forcedProvider?: Provider) {
    try {
      const { data, error: messageError } = await supabase
        .from("messages")
        .select(
          "role, content, created_at, response_time_ms, critiq_verdict, critiq_confidence, critiq_feasibility_score, critiq_summary, critiq_key_claims, critiq_contradictions, critiq_risks, critiq_missing_info, critiq_next_steps"
        )
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (messageError) throw messageError;

      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const mappedTurns: ChatTurn[] = rows
        .filter((row) => row.role === "user" || row.role === "assistant")
        .map((row) => {
          const at = typeof row.created_at === "string" ? Date.parse(row.created_at) : Date.now();
          if (row.role === "user") {
            return {
              role: "user",
              content: typeof row.content === "string" ? row.content : "",
              at: Number.isFinite(at) ? at : Date.now(),
            } as ChatTurn;
          }

          const verdict =
            row.critiq_verdict === "Proceed" ||
            row.critiq_verdict === "Proceed with Caution" ||
            row.critiq_verdict === "Not Recommended"
              ? (row.critiq_verdict as CritiqVerdict)
              : "Proceed with Caution";

          const critiq: CritiqResult | undefined =
            typeof row.critiq_verdict === "string"
              ? {
                  verdict,
                  confidence: normalizeScoreValue(
                    row.critiq_confidence,
                    verdict === "Proceed" ? 78 : verdict === "Not Recommended" ? 38 : 62
                  ),
                  feasibilityScore: normalizeScoreValue(
                    row.critiq_feasibility_score,
                    verdict === "Proceed" ? 74 : verdict === "Not Recommended" ? 32 : 56
                  ),
                  summary: typeof row.critiq_summary === "string" ? row.critiq_summary : "",
                  keyClaims: Array.isArray(row.critiq_key_claims)
                    ? (row.critiq_key_claims as CritiqResult["keyClaims"])
                    : [],
                  contradictions: Array.isArray(row.critiq_contradictions)
                    ? (row.critiq_contradictions as string[])
                    : [],
                  risks: Array.isArray(row.critiq_risks)
                    ? (row.critiq_risks as CritiqResult["risks"])
                    : [],
                  missingInfo: Array.isArray(row.critiq_missing_info)
                    ? (row.critiq_missing_info as string[])
                    : [],
                  recommendedNextSteps: Array.isArray(row.critiq_next_steps)
                    ? (row.critiq_next_steps as string[])
                    : [],
                }
              : undefined;

          return {
            role: "assistant",
            content: typeof row.content === "string" ? row.content : "",
            at: Number.isFinite(at) ? at : Date.now(),
            responseTimeMs:
              typeof row.response_time_ms === "number" ? row.response_time_ms : undefined,
            critiq,
          } as ChatTurn;
        });

      setActiveConversationId(conversationId);
      setTurns(mappedTurns);
      setError(null);

      if (forcedProvider) {
        setProvider(forcedProvider);
      } else {
        const selected = conversations.find((c) => c.id === conversationId);
        if (selected) setProvider(selected.provider);
      }

      if (isMobile) {
        setSidebarOpen(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load this conversation.";
      setError(msg);
    }
  }

  async function loadConversations(selectMostRecent: boolean) {
    try {
      setHistoryLoading(true);
      const userId = await getCurrentUserId();
      const { data, error: listError } = await supabase
        .from("conversations")
        .select("id, title, provider, updated_at, created_at")
        .eq("user_id", userId)
        .eq("archived", false)
        .order("updated_at", { ascending: false })
        .limit(100);

      if (listError) throw listError;

      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const mapped: ConversationSummary[] = rows
        .filter((row) => typeof row.id === "string")
        .map((row) => ({
          id: String(row.id),
          title:
            typeof row.title === "string" && row.title.trim()
              ? row.title.trim()
              : "Untitled conversation",
          provider: row.provider === "gemini" ? "gemini" : "openrouter",
          updatedAt:
            typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
          createdAt:
            typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
        }));

      setConversations(mapped);

      if (selectMostRecent && mapped.length > 0) {
        await openConversation(mapped[0].id, mapped[0].provider);
      } else if (mapped.length === 0) {
        setTurns([]);
        setActiveConversationId(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load history.";
      setError(msg);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function createConversation(currentProvider: Provider) {
    const userId = await getCurrentUserId();
    const nowIso = new Date().toISOString();
    const { data, error: createError } = await supabase
      .from("conversations")
      .insert({
        user_id: userId,
        title: "New chat",
        provider: currentProvider,
      })
      .select("id, title, provider, updated_at, created_at")
      .single();

    if (createError || !data) {
      throw new Error(createError?.message || "Failed to create conversation.");
    }

    const row = data as Record<string, unknown>;
    const summary: ConversationSummary = {
      id: String(row.id),
      title:
        typeof row.title === "string" && row.title.trim()
          ? row.title.trim()
          : "Untitled conversation",
      provider: row.provider === "gemini" ? "gemini" : "openrouter",
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : nowIso,
      createdAt: typeof row.created_at === "string" ? row.created_at : nowIso,
    };
    upsertConversationSummary(summary);
    return summary;
  }

  async function saveMessage(params: {
    conversationId: string;
    turn: ChatTurn;
    error?: string;
  }) {
    const row: Record<string, unknown> = {
      conversation_id: params.conversationId,
      role: params.turn.role,
      content: params.turn.content,
    };

    if (params.turn.role === "assistant") {
      row.response_time_ms = params.turn.responseTimeMs ?? null;
      row.error = params.error ?? null;
      row.critiq_verdict = params.turn.critiq?.verdict ?? null;
      row.critiq_confidence = params.turn.critiq?.confidence ?? null;
      row.critiq_feasibility_score = params.turn.critiq?.feasibilityScore ?? null;
      row.critiq_summary = params.turn.critiq?.summary ?? null;
      row.critiq_key_claims = params.turn.critiq?.keyClaims ?? null;
      row.critiq_contradictions = params.turn.critiq?.contradictions ?? null;
      row.critiq_risks = params.turn.critiq?.risks ?? null;
      row.critiq_missing_info = params.turn.critiq?.missingInfo ?? null;
      row.critiq_next_steps = params.turn.critiq?.recommendedNextSteps ?? null;
    }

    const { error: insertError } = await supabase.from("messages").insert(row);
    if (insertError) {
      throw new Error(insertError.message || "Failed to store message.");
    }
  }

  async function touchConversation(conversationId: string, currentProvider: Provider, title?: string) {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      provider: currentProvider,
    };
    if (title && title.trim()) {
      patch.title = title.trim();
    }

    const { data, error: updateError } = await supabase
      .from("conversations")
      .update(patch)
      .eq("id", conversationId)
      .select("id, title, provider, updated_at, created_at")
      .single();

    if (updateError || !data) {
      throw new Error(updateError?.message || "Failed to update conversation.");
    }

    const row = data as Record<string, unknown>;
    const summary: ConversationSummary = {
      id: String(row.id),
      title:
        typeof row.title === "string" && row.title.trim()
          ? row.title.trim()
          : "Untitled conversation",
      provider: row.provider === "gemini" ? "gemini" : "openrouter",
      updatedAt:
        typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
      createdAt:
        typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    };
    upsertConversationSummary(summary);
  }

  async function generateConversationTitle(params: {
    provider: Provider;
    apiKey: string;
    prompt: string;
    answer: string;
  }) {
    const res = await fetch("/compare-ai/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const dataUnknown = (await res.json().catch(() => null)) as unknown;
    const data = isRecord(dataUnknown) ? dataUnknown : {};
    if (!res.ok) {
      return buildFallbackConversationTitle(params.prompt, params.answer);
    }
    const title = typeof data.title === "string" ? data.title.trim() : "";
    return title || buildFallbackConversationTitle(params.prompt, params.answer);
  }

  function buildFallbackConversationTitle(prompt: string, answer: string) {
    const text = `${prompt} ${answer}`
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const stopWords = new Set([
      "the",
      "and",
      "for",
      "with",
      "that",
      "this",
      "from",
      "your",
      "you",
      "are",
      "was",
      "were",
      "best",
      "what",
      "how",
      "why",
      "can",
      "could",
      "should",
      "want",
      "need",
      "learn",
    ]);
    const words = text
      .split(" ")
      .filter((word) => word.length > 2 && !stopWords.has(word.toLowerCase()));
    const picked = words.slice(0, 4).join(" ").trim();
    return picked ? `${picked[0].toUpperCase()}${picked.slice(1)}` : "Untitled conversation";
  }

  async function copyMessage(content: string, turnAt: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedTurn(turnAt);
      window.setTimeout(() => setCopiedTurn(null), 1600);
    } catch {
      setError("Could not copy this message.");
    }
  }

  function forwardMessage(content: string) {
    setDraft((prev) => {
      const next = content.trim();
      return prev.trim() ? `${prev.trim()}\n\n${next}` : next;
    });

    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    });
  }

  async function reportMessage(turn: ChatTurn) {
    const reasonInput = window.prompt(
      "Please share a report reason (e.g. incorrect, unsafe, irrelevant, spam):",
      "incorrect"
    );
    if (reasonInput === null) {
      return;
    }
    const reason = reasonInput.trim() || "unspecified";

    const reportBody = [
      "MAI Chat Report",
      `Conversation ID: ${activeConversationId ?? "(new)"}`,
      `Provider: ${provider}`,
      `Timestamp: ${new Date(turn.at).toISOString()}`,
      `Reason: ${reason}`,
      "",
      "Assistant message:",
      turn.content,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(reportBody);
      setReportedTurn(turn.at);
      setError("Report copied. You can now share it with support.");
      window.setTimeout(() => setReportedTurn(null), 1600);
    } catch {
      setError("Could not create report for this message.");
    }
  }

  async function streamGeminiResponse(params: {
    provider: Provider;
    apiKey: string;
    prompt: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    onDelta: (delta: string) => void;
    onDone: (finalAnswer: string) => void;
  }) {
    const res = await fetch("/compare-ai/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!res.ok || !res.body) {
      const dataUnknown = (await res.json().catch(() => null)) as unknown;
      const data = isRecord(dataUnknown) ? dataUnknown : {};
      const err = typeof data.error === "string" ? data.error : "Stream request failed";
      throw new Error(err);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let donePayload: Record<string, unknown> | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const lines = block.split("\n");
        let event = "message";
        let dataLine = "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("event:")) {
            event = trimmed.slice(6).trim();
          } else if (trimmed.startsWith("data:")) {
            dataLine += `${trimmed.slice(5)}\n`;
          }
        }

        if (!dataLine) continue;

        try {
          const payloadUnknown = JSON.parse(dataLine.trim()) as unknown;
          const payload = isRecord(payloadUnknown) ? payloadUnknown : {};

          if (event === "step") {
            const text = typeof payload.text === "string" ? payload.text : "";
            if (text) {
              setAgenticSteps((prev) => [...prev, text]);
              setActiveAgentStep((prev) => prev + 1);
              setThinkingStream((prev) => {
                const updated = prev ? `${prev}\n${text}` : text;
                return updated.length > 4000 ? updated.slice(-4000) : updated;
              });
            }
            continue;
          }

          if (event === "error") {
            const err = typeof payload.error === "string" ? payload.error : "Streaming failed";
            throw new Error(err);
          }

          if (event === "delta") {
            const delta = typeof payload.delta === "string" ? payload.delta : "";
            if (delta) {
              params.onDelta(delta);
            }
            continue;
          }

          if (event === "done") {
            donePayload = payload;
            const finalAnswer = typeof payload.answer === "string" ? payload.answer : "";
            if (finalAnswer) {
              params.onDone(finalAnswer);
            }
          }
        } catch (error) {
          if (error instanceof Error) {
            throw error;
          }
        }
      }
    }

    if (!donePayload) {
      throw new Error("Streaming did not complete.");
    }

    if (typeof donePayload.answer === "string") {
      params.onDone(donePayload.answer);
    }

    return donePayload;
  }

  async function send() {
    const prompt = draft.trim();
    if (isLoading) return;
    if (!prompt) {
      setError("Please enter a prompt before sending.");
      return;
    }

    setError(null);
    const apiKey = activeKey.trim();
    if (!apiKey) {
      setError(`No ${providerLabel} API key is set. Add one to continue.`);
      return;
    }

    const userTurn: ChatTurn = {
      id: `user-${Date.now()}`,
      role: "user",
      content: prompt,
      at: Date.now(),
    };
    const nextTurns = [...turns, userTurn];
    const firstTurnInConversation = turns.length === 0;
    let liveAnswer = "";
    setTurns(nextTurns);
    setDraft("");
    setIsLoading(true);
    setThinkingStream("");
    setLiveAssistantMessage("");
    setIsStreamingAnswer(false);
    answerStreamStartedRef.current = false;
    setIsStreamingThinking(provider === "gemini");
    setAgenticSteps([
      "Reading the request and separating the core claims...",
    ]);

    try {
      let conversationId = activeConversationId;
      if (!conversationId) {
        const created = await createConversation(provider);
        conversationId = created.id;
        setActiveConversationId(created.id);
      }

      await saveMessage({ conversationId, turn: userTurn });
      await touchConversation(conversationId, provider);

      const assistantDraftId = `assistant-${Date.now()}`;
      const assistantDraftTurn: ChatTurn = {
        id: assistantDraftId,
        role: "assistant",
        content: "",
        at: Date.now(),
        responseTimeMs: undefined,
        streaming: provider === "gemini",
      };

      setTurns((prev) => [...prev, assistantDraftTurn]);

      const messages = nextTurns.map((t) => ({
        role: t.role,
        content: t.content,
      }));
      const data =
        provider === "gemini"
          ? await streamGeminiResponse({
              provider,
              apiKey,
              prompt,
              messages,
              onDelta: (delta) => {
                if (!answerStreamStartedRef.current) {
                  answerStreamStartedRef.current = true;
                  setIsStreamingAnswer(true);
                  setIsStreamingThinking(false);
                  setThinkingStream("");
                }
                liveAnswer += delta;
                setLiveAssistantMessage((prev) => {
                  const updated = `${prev}${delta}`;
                  return updated.length > 12000 ? updated.slice(-12000) : updated;
                });
                setTurns((prev) =>
                  prev.map((turn) =>
                    turn.id === assistantDraftId && turn.role === "assistant"
                      ? {
                          ...turn,
                          content: liveAnswer,
                        }
                      : turn
                  )
                );
              },
              onDone: (finalAnswer) => {
                liveAnswer = finalAnswer || liveAnswer;
                setLiveAssistantMessage(finalAnswer || liveAnswer);
                setTurns((prev) =>
                  prev.map((turn) =>
                    turn.id === assistantDraftId && turn.role === "assistant"
                      ? {
                          ...turn,
                          content: liveAnswer || turn.content || "(empty)",
                          streaming: false,
                        }
                      : turn
                  )
                );
              },
            })
          : await (async () => {
              const res = await fetch("/compare-ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  provider,
                  apiKey,
                  prompt,
                  messages,
                }),
              });
              const dataUnknown = (await res.json().catch(() => null)) as unknown;
              const parsed = isRecord(dataUnknown) ? dataUnknown : {};
              if (!res.ok) {
                const err = typeof parsed.error === "string" ? parsed.error : "Request failed";
                throw new Error(err);
              }
              return parsed;
            })();

      const critiqData = isRecord(data.critiq) ? (data.critiq as Record<string, unknown>) : null;
      const verdict =
        critiqData?.verdict === "Proceed" ||
        critiqData?.verdict === "Proceed with Caution" ||
        critiqData?.verdict === "Not Recommended"
          ? (critiqData.verdict as CritiqVerdict)
          : "Proceed with Caution";
      const confidenceFallback = verdict === "Proceed" ? 78 : verdict === "Not Recommended" ? 38 : 62;
      const feasibilityFallback = verdict === "Proceed" ? 74 : verdict === "Not Recommended" ? 32 : 56;

      const assistantTurn: ChatTurn = {
        id: assistantDraftTurn.id,
        role: "assistant",
        content:
          typeof data.answer === "string" && data.answer.trim()
            ? data.answer
            : liveAnswer.trim() || liveAssistantMessage.trim() || "(empty)",
        at: Date.now(),
        responseTimeMs:
          typeof data.responseTimeMs === "number" ? data.responseTimeMs : undefined,
        critiq: critiqData
          ? {
              verdict,
              confidence: normalizeScoreValue(critiqData.confidence, confidenceFallback),
              feasibilityScore: normalizeScoreValue(critiqData.feasibilityScore, feasibilityFallback),
              summary: typeof critiqData.summary === "string" ? critiqData.summary : "",
              keyClaims: Array.isArray(critiqData.keyClaims)
                ? (critiqData.keyClaims as CritiqResult["keyClaims"])
                : [],
              contradictions: Array.isArray(critiqData.contradictions)
                ? (critiqData.contradictions as string[])
                : [],
              risks: Array.isArray(critiqData.risks)
                ? (critiqData.risks as CritiqResult["risks"])
                : [],
              missingInfo: Array.isArray(critiqData.missingInfo)
                ? (critiqData.missingInfo as string[])
                : [],
              recommendedNextSteps: Array.isArray(critiqData.recommendedNextSteps)
                ? (critiqData.recommendedNextSteps as string[])
                : [],
            }
          : undefined,
        agenticSteps,
      };

      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === assistantDraftId && turn.role === "assistant"
            ? assistantTurn
            : turn
        )
      );

      await saveMessage({ conversationId, turn: assistantTurn });
      await touchConversation(conversationId, provider);

      if (firstTurnInConversation) {
        try {
          await new Promise((resolve) => window.setTimeout(resolve, 1200));
          const generatedTitle = await generateConversationTitle({
            provider,
            apiKey,
            prompt,
            answer: assistantTurn.content,
          });
          await touchConversation(conversationId, provider, generatedTitle);
        } catch {
          // Keep fallback title if title generation fails.
        }
      }

    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsStreamingThinking(false);
      setThinkingStream("");
      setLiveAssistantMessage("");
        setIsStreamingAnswer(false);
        answerStreamStartedRef.current = false;
      setAgenticSteps([]);
    }
  }

  function formatConversationTime(isoTime: string) {
    const date = new Date(isoTime);
    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    if (sameDay) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-[#EDEDED] md:pl-64">
      {/* Mobile Menu Button */}
      {isMobile && !sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-4 left-4 z-50 rounded-lg border border-[#2A2A2E] bg-[#18181B] p-2 shadow-lg transition hover:bg-[#202024]"
        >
          <Menu size={18} />
        </button>
      )}

      {/* SIDEBAR */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } fixed left-0 top-0 z-40 flex h-dvh w-72 flex-col overflow-hidden border-r border-[#242428] bg-[#101012]/98 backdrop-blur-xl transition-transform duration-300 ease-in-out md:w-64 md:translate-x-0 ${
          isMobile ? "shadow-2xl" : ""
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between border-b border-[#242428] bg-[#101012]/98 p-4 backdrop-blur-sm">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#303036] bg-[#222225] shadow-lg transition group-hover:bg-[#2A2A2F]">
              <Shield size={16} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">MAI</div>
              <div className="text-[10px] text-[#8B8B92]">Adversarial AI</div>
            </div>
          </Link>
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-2 transition hover:bg-[#1A1A1D]"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* New Chat Button - Reduced Height */}
        <div className="p-3">
          <button
            onClick={() => {
              setTurns([]);
              setDraft("");
              setError(null);
              setActiveConversationId(null);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#2A2A2E] bg-[#19191C] px-3 py-2 text-sm font-medium text-[#EDEDED] transition hover:border-[#3B3B40] hover:bg-[#222226]"
          >
            <Plus size={14} />
            New Chat
          </button>
        </div>

        {/* History Section - Compact */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-color:#3A3A40_transparent] [scrollbar-width:thin]">
          <div className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-[#8B8B92]">
            Recent Conversations
          </div>
          {historyLoading ? (
            <div className="py-6 text-center text-xs text-[#6F6F76]">Loading history...</div>
          ) : conversations.length === 0 ? (
            <div className="py-6 text-center text-xs text-[#6F6F76]">No history yet</div>
          ) : (
            <div className="space-y-1.5">
              {conversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId;
                return (
                  <button
                    key={conversation.id}
                    onClick={() => void openConversation(conversation.id, conversation.provider)}
                    className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                      isActive
                        ? "border-[#3B3B40] bg-[#222226]"
                        : "border-[#2A2A2E] bg-[#151518] hover:bg-[#1D1D21]"
                    }`}
                  >
                    <div className="truncate text-xs font-medium text-[#EDEDED]">
                      {conversation.title}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-[#8B8B92]">
                      <span>{conversation.provider === "gemini" ? "Gemini" : "OpenRouter"}</span>
                      <span>{formatConversationTime(conversation.updatedAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Settings Section - Compact Boxes (now at bottom) */}
        <div className="mt-auto space-y-3 border-t border-[#242428] p-3">
          {/* Provider Toggle - Compact */}
          <div>
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-[#8B8B92]">
              AI Provider
            </div>
            <div className="flex rounded-lg border border-[#2A2A2E] bg-[#0B0B0D] p-0.5">
              <button
                onClick={() => setProvider("openrouter")}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  provider === "openrouter"
                    ? "bg-[#242428] text-[#EDEDED]"
                    : "text-[#8B8B92] hover:text-[#EDEDED]"
                }`}
              >
                OpenRouter
              </button>
              <button
                onClick={() => setProvider("gemini")}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  provider === "gemini"
                    ? "bg-[#242428] text-[#EDEDED]"
                    : "text-[#8B8B92] hover:text-[#EDEDED]"
                }`}
              >
                Gemini
              </button>
            </div>
          </div>

          {/* API Key Input - Compact */}
          <div>
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-[#8B8B92]">
              API Key
            </div>
            <div className="flex gap-1.5">
              <input
                type="password"
                value={apiKeyDraft}
                onChange={(e) => setApiKeyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleApiKeyAction();
                }}
                placeholder={
                  isEditingKey
                    ? provider === "openrouter"
                      ? "Enter new OpenRouter key..."
                      : "Enter new Gemini key..."
                    : provider === "openrouter"
                      ? "sk-or-..."
                      : "AIza..."
                }
                className="min-w-0 flex-1 rounded-lg border border-[#2A2A2E] bg-[#0B0B0D] px-3 py-2 text-xs text-[#EDEDED] outline-none transition placeholder:text-[#56565D] focus:border-[#5A5A62] focus:ring-2 focus:ring-[#52525B]/30"
              />
              <button
                onClick={handleApiKeyAction}
                className="group inline-flex min-w-[76px] items-center justify-center rounded-lg border border-[#3A3A40] bg-[#242428] px-3 py-2 text-xs font-medium uppercase tracking-wide text-[#EDEDED] transition hover:bg-[#303036]"
                title={
                  hasActiveKey && !isEditingKey
                    ? `Change ${providerLabel} key`
                    : `${isEditingKey ? "Save" : "Set"} ${providerLabel} key`
                }
              >
                {hasActiveKey && !isEditingKey ? (
                  <>
                    <Check size={13} className="block group-hover:hidden" />
                    <span className="hidden group-hover:inline">Change</span>
                  </>
                ) : (
                  isEditingKey ? "Save" : "Set"
                )}
              </button>
            </div>
            {hasActiveKey ? (
              <div className="px-2 pt-1 text-[10px] text-[#8B8B92]">
                Key set for {providerLabel}
              </div>
            ) : (
              <div className="px-2 pt-1 text-[10px] text-rose-300">
                No API key set for {providerLabel}
              </div>
            )}
          </div>

          {/* Action Buttons - Compact with Hover */}
          <div className="space-y-1.5 pt-1">
            <button
              onClick={() => void signOut()}
              className="flex w-full items-center gap-2 rounded-lg border border-[#2A2A2E] bg-[#19191C] px-3 py-2 text-xs text-[#B7B7BE] transition hover:bg-[#222226] hover:text-[#EDEDED]"
            >
              <LogOut size={12} />
              Sign out
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center gap-2 border-t border-[#242428] pt-3">
            <a
              href="https://github.com/iiioooiso/Multimodal-Adversarial-AI"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-[#2A2A2E] bg-[#0B0B0D] p-1.5 text-[#8B8B92] transition hover:border-[#3F3F45] hover:text-[#EDEDED]"
            >
              <Github size={12} />
            </a>
            <a
              href="https://www.linkedin.com/in/ashutosh-singh-350b33291/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-[#2A2A2E] bg-[#0B0B0D] p-1.5 text-[#8B8B92] transition hover:border-[#3F3F45] hover:text-[#EDEDED]"
            >
              <Users size={12} />
            </a>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-30" onClick={() => setSidebarOpen(false)} />
      )}

      {/* MAIN CHAT AREA */}
      <div className="relative flex min-h-screen flex-col">
        {/* Chat Messages */}
        <div
          ref={chatRef}
          className="flex-1 overflow-y-auto px-4 pb-36 pt-6 md:px-8 [scrollbar-color:#3A3A40_transparent] [scrollbar-width:thin]"
        >
          <div className="max-w-3xl mx-auto">
            {/* Empty State */}
            {turns.length === 0 && !isLoading ? (
              <div className="flex min-h-[70vh] items-center justify-center">
                <div className="text-center max-w-xl">
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#303036] bg-[#202024] shadow-xl">
                    <Sparkles size={28} className="text-white" />
                  </div>
                  <h1 className="mb-3 text-2xl font-bold text-[#F4F4F5] md:text-3xl">
                    Multimodal Adversarial AI
                  </h1>
                  <p className="text-sm leading-relaxed text-[#B7B7BE]">
                    Ask anything. MAI extracts claims, verifies feasibility, detects contradictions,
                    and challenges assumptions before execution.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 mt-6">
                    <div className="flex items-center gap-1.5 rounded-full border border-[#2A2A2E] bg-[#19191C] px-3 py-1.5 text-xs text-[#A1A1AA]">
                      <Zap size={12} />
                      Real-time
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full border border-[#2A2A2E] bg-[#19191C] px-3 py-1.5 text-xs text-[#A1A1AA]">
                      <Shield size={12} />
                      Risk assessment
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Chat Turns */}
            <div className="space-y-8">
              {turns.map((t, idx) => {
                const isUser = t.role === "user";
                return (
                  <div
                    key={`${t.at}-${idx}`}
                    className={`group flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[92%] md:max-w-[78%] ${
                        isUser ? "text-right" : "text-left"
                      }`}
                    >
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#73737A]">
                        {isUser ? "You" : "MAI"}
                      </div>
                      <FormattedMessage content={t.content} isUser={isUser} />
                      {t.role === "assistant" && t.critiq ? (
                        <div className="mt-5 border-t border-[#26262B] pt-4">
                          <CritiqDisplay critiq={t.critiq} responseTimeMs={t.responseTimeMs} />
                        </div>
                      ) : null}
                      <div
                        className={`mt-2 flex gap-1.5 opacity-0 transition group-hover:opacity-100 ${
                          isUser ? "justify-end" : "justify-start"
                        }`}
                      >
                        <button
                          onClick={() => void copyMessage(t.content, t.at)}
                          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#2A2A2E] bg-[#141416] px-2 text-[11px] text-[#A1A1AA] transition hover:bg-[#202024] hover:text-[#EDEDED]"
                          title="Copy message"
                        >
                          {copiedTurn === t.at ? <Check size={12} /> : <Copy size={12} />}
                          {copiedTurn === t.at ? "Copied" : "Copy"}
                        </button>
                        <button
                          onClick={() => forwardMessage(t.content)}
                          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#2A2A2E] bg-[#141416] px-2 text-[11px] text-[#A1A1AA] transition hover:bg-[#202024] hover:text-[#EDEDED]"
                          title="Forward to composer"
                        >
                          <CornerUpRight size={12} />
                          Forward
                        </button>
                        {!isUser ? (
                          <button
                            onClick={() => void reportMessage(t)}
                            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#2A2A2E] bg-[#141416] px-2 text-[11px] text-[#A1A1AA] transition hover:bg-[#202024] hover:text-[#EDEDED]"
                            title="Copy report"
                          >
                            <Flag size={12} />
                            {reportedTurn === t.at ? "Reported" : "Report"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Loading State */}
              {isLoading ? (
                <div className="flex justify-start">
                  <div className="max-w-[92%] md:max-w-[78%]">
                    {isStreamingThinking ? (
                      <div className="relative overflow-hidden bg-transparent">
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.09),_transparent_62%)]" />
                        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-[#0B0B0D] to-transparent" />
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-14 bg-gradient-to-t from-[#0B0B0D] to-transparent" />
                        <div className="pointer-events-none mb-2 flex items-center justify-between px-1 text-[10px] uppercase tracking-[0.24em] text-[#8B8B92]/70">
                          <span>Thinking stream</span>
                          <span>{thinkingStream.trim() ? `${thinkingStream.length} chars` : "waiting"}</span>
                        </div>
                        <div className="relative max-h-[180px] overflow-hidden px-3 py-4 text-sm leading-7 tracking-[0.01em] text-[#E7E7EC]/90 [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]">
                          <div className="pointer-events-none select-none whitespace-pre-wrap break-words [user-select:none]">
                            {(() => {
                              const visibleThinking = thinkingStream.split("\n").slice(-6).join("\n");
                              const visibleSteps = agenticSteps.slice(-6).join("\n");
                              const content = visibleThinking.trim()
                                ? visibleThinking
                                : visibleSteps.trim()
                                  ? visibleSteps
                                  : "Preparing streamed reasoning...";
                              return <FormattedMessage content={content} isUser={false} />;
                            })()}
                          </div>
                          <div className="pointer-events-none absolute bottom-3 right-3">
                            <div className="flex items-center gap-1">
                              <span className="h-2 w-2 animate-bounce rounded-full bg-white/70 [animation-delay:-0.3s]" />
                              <span className="h-2 w-2 animate-bounce rounded-full bg-white/70 [animation-delay:-0.15s]" />
                              <span className="h-2 w-2 animate-bounce rounded-full bg-white/70" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {agenticSteps.slice(0, activeAgentStep + 1).map((step, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm text-[#B7B7BE]">
                            <span
                              className={`mt-2 h-1.5 w-1.5 rounded-full ${
                                idx === activeAgentStep
                                  ? "animate-pulse bg-[#EDEDED]"
                                  : "bg-[#595960]"
                              }`}
                            />
                            {step}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="relative z-10 mx-auto mb-3 w-full max-w-3xl px-4">
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[#242428] bg-[#0B0B0D]/92 px-4 py-3 backdrop-blur-xl md:left-64 md:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 rounded-2xl border border-[#2A2A2E] bg-[#151517] px-2.5 py-2 shadow-2xl shadow-black/25">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask anything..."
                rows={1}
                className="max-h-[96px] min-h-[34px] flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2 text-sm leading-5 text-[#EDEDED] outline-none placeholder:text-[#6F6F76] [scrollbar-color:#3A3A40_transparent] [scrollbar-width:thin]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                onClick={() => void send()}
                disabled={isLoading || !draft.trim()}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EDEDED] text-[#0B0B0D] transition hover:bg-white disabled:cursor-not-allowed disabled:bg-[#3A3A40] disabled:text-[#77777E]"
              >
                <Send size={16} />
              </button>
            </div>
            <div className="mt-2 text-center text-[11px] text-[#6F6F76]">
              Human-first adversarial AI verification
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeScoreValue(value: unknown, fallback: number) {
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw)) return fallback;
  const rounded = Math.max(0, Math.min(100, Math.round(raw)));
  return rounded <= 1 ? fallback : rounded;
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return tokens.map((token, index) => {
    const isBold = token.startsWith("**") && token.endsWith("**") && token.length > 4;
    if (isBold) {
      return (
        <strong key={`${keyPrefix}-b-${index}`} className="font-semibold text-[#F4F4F5]">
          {token.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-t-${index}`}>{token}</span>;
  });
}

function FormattedMessage({
  content,
  isUser,
}: {
  content: string;
  isUser: boolean;
}) {
  const lines = content.split("\n");

  return (
    <div
      className={`space-y-2 text-sm leading-7 ${
        isUser ? "text-[#F4F4F5]" : "text-[#DCDCE0]"
      }`}
    >
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-2" />;

        const heading = trimmed.match(/^(#{1,3})\s+(.+)/);
        if (heading) {
          return (
            <div key={idx} className="pt-2 text-base font-semibold text-[#F4F4F5]">
              {renderInlineMarkdown(heading[2], `h-${idx}`)}
            </div>
          );
        }

        const bullet = trimmed.match(/^[-*]\s+(.+)/);
        if (bullet) {
          return (
            <div key={idx} className="flex gap-2 text-left">
              <span className="mt-[0.7rem] h-1 w-1 shrink-0 rounded-full bg-[#8B8B92]" />
              <span>{renderInlineMarkdown(bullet[1], `b-${idx}`)}</span>
            </div>
          );
        }

        const numbered = trimmed.match(/^(\d+)[.)]\s+(.+)/);
        if (numbered) {
          return (
            <div key={idx} className="flex gap-2 text-left">
              <span className="min-w-5 text-[#8B8B92]">{numbered[1]}.</span>
              <span>{renderInlineMarkdown(numbered[2], `n-${idx}`)}</span>
            </div>
          );
        }

        return (
          <p key={idx} className="whitespace-pre-wrap">
            {renderInlineMarkdown(trimmed, `p-${idx}`)}
          </p>
        );
      })}
    </div>
  );
}

function CritiqDisplay({
  critiq,
  responseTimeMs,
}: {
  critiq: CritiqResult;
  responseTimeMs?: number;
}) {
  const tone = verdictTone(critiq.verdict);
  const VerdictIcon = tone.icon;

  return (
    <div className="space-y-3">
      {/* Verdict Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${tone.badge}`}>
          <VerdictIcon size={12} />
          {tone.label}
        </div>
        {responseTimeMs && (
          <span className="text-[10px] text-[#8B8B92]">{Math.round(responseTimeMs)}ms</span>
        )}
      </div>

      {/* Summary */}
      {critiq.summary && (
        <div className="text-xs leading-relaxed text-[#B7B7BE]">
          {critiq.summary}
        </div>
      )}

      {/* Score Cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="border-t border-[#26262B] pt-2">
          <div className="text-[10px] uppercase text-[#8B8B92]">Confidence</div>
          <div className="text-sm font-semibold text-[#EDEDED]">{percent(critiq.confidence)}%</div>
        </div>
        <div className="border-t border-[#26262B] pt-2">
          <div className="text-[10px] uppercase text-[#8B8B92]">Feasibility</div>
          <div className="text-sm font-semibold text-[#EDEDED]">{percent(critiq.feasibilityScore)}%</div>
        </div>
      </div>

      {/* Key Risks */}
      {critiq.risks?.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-semibold text-[#B7B7BE]">Key Risks</div>
          <div className="space-y-1.5">
            {critiq.risks.slice(0, 3).map((r, i) => (
              <div key={i} className="flex gap-2 text-xs text-[#B7B7BE]">
                <span className="text-[#8B8B92]">-</span>
                <span>{r.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
