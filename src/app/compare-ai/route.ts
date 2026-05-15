import { NextRequest, NextResponse } from "next/server";

type Provider = "openrouter" | "gemini";

type ChatMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};

type CritiqVerdict = "Proceed" | "Proceed with Caution" | "Not Recommended";

export type CritiqResult = {
    verdict: CritiqVerdict;
    confidence: number; // 0-100
    feasibilityScore: number; // 0-100
    summary: string;
    keyClaims: Array<{
        claim: string;
        domain: "technical" | "economic" | "timeline" | "legal" | "operational" | "unknown";
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

function readString(value: unknown) {
    return typeof value === "string" ? value : undefined;
}

function readArray(value: unknown) {
    return Array.isArray(value) ? value : undefined;
}

function isChatRole(value: unknown): value is ChatMessage["role"] {
    return value === "system" || value === "user" || value === "assistant";
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
    const asNumber = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(asNumber)) return fallback;
    return Math.min(max, Math.max(min, Math.round(asNumber)));
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripCodeFences(text: string) {
    return text.replace(/^```[a-zA-Z]*\s*/g, "").replace(/```\s*$/g, "").trim();
}

function extractFirstJsonObject(text: string): unknown | null {
    const cleaned = stripCodeFences(text);
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try {
        return JSON.parse(candidate) as unknown;
    } catch {
        return null;
    }
}

function normalizeCritiqResult(raw: unknown): CritiqResult {
    const r = isRecord(raw) ? raw : {};
    const verdictCandidate = readString(r.verdict);
    const verdict: CritiqVerdict =
        verdictCandidate === "Proceed" ||
        verdictCandidate === "Proceed with Caution" ||
        verdictCandidate === "Not Recommended"
            ? verdictCandidate
            : "Proceed with Caution";

    const confidenceFallback =
        verdict === "Proceed" ? 78 : verdict === "Not Recommended" ? 38 : 62;
    const feasibilityFallback =
        verdict === "Proceed" ? 74 : verdict === "Not Recommended" ? 32 : 56;
    const confidenceRaw = clampInt(r.confidence, 0, 100, confidenceFallback);
    const feasibilityRaw = clampInt(r.feasibilityScore, 0, 100, feasibilityFallback);

    return {
        verdict,
        confidence: confidenceRaw <= 1 ? confidenceFallback : confidenceRaw,
        feasibilityScore: feasibilityRaw <= 1 ? feasibilityFallback : feasibilityRaw,
        summary: readString(r.summary) ?? "",
        keyClaims: (() => {
            const list = readArray(r.keyClaims);
            if (!list) return [];
            return list
                .filter((c) => isRecord(c) && typeof c.claim === "string")
                .slice(0, 12)
                .map((c) => {
                    const domain = isRecord(c) ? readString(c.domain) : undefined;
                    const assumptions = isRecord(c) ? readArray(c.assumptions) : undefined;
                    return {
                        claim: (c as Record<string, unknown>).claim as string,
                        domain:
                            domain === "technical" ||
                            domain === "economic" ||
                            domain === "timeline" ||
                            domain === "legal" ||
                            domain === "operational"
                                ? domain
                                : "unknown",
                        assumptions: assumptions
                            ? assumptions.filter((a) => typeof a === "string").slice(0, 6)
                            : [],
                    };
                });
        })(),
        contradictions: (() => {
            const list = readArray(r.contradictions);
            if (!list) return [];
            return list.filter((x) => typeof x === "string").slice(0, 10) as string[];
        })(),
        risks: (() => {
            const list = readArray(r.risks);
            if (!list) return [];
            return list
                .filter((x) => isRecord(x) && typeof x.title === "string")
                .slice(0, 10)
                .map((x) => {
                    const title = (x as Record<string, unknown>).title as string;
                    const severity = readString((x as Record<string, unknown>).severity);
                    return {
                        title,
                        severity:
                            severity === "low" || severity === "medium" || severity === "high"
                                ? severity
                                : "medium",
                        whyItMatters: readString((x as Record<string, unknown>).whyItMatters) ?? "",
                        mitigation: readString((x as Record<string, unknown>).mitigation) ?? "",
                    };
                });
        })(),
        missingInfo: (() => {
            const list = readArray(r.missingInfo);
            if (!list) return [];
            return list.filter((x) => typeof x === "string").slice(0, 10) as string[];
        })(),
        recommendedNextSteps: (() => {
            const list = readArray(r.recommendedNextSteps);
            if (!list) return [];
            return list.filter((x) => typeof x === "string").slice(0, 10) as string[];
        })(),
    };
}

function buildGeneratorSystemPrompt() {
    return [
        "You are a helpful senior engineer.",
        "Answer the user clearly and concretely.",
        "Do not assume hidden infrastructure; call out unknowns briefly.",
        "Prefer practical steps and tradeoffs over hype.",
    ].join(" ");
}

function buildCritiqSystemPrompt() {
    return [
        "You are CRITIQ: an adversarial AI verification layer.",
        "Your job is to adversarially audit the assistant answer for feasibility, practicality, and hidden assumptions.",
        "Extract key claims; test them against technical, economic, logical, and real-world constraints; detect contradictions.",
        "Be skeptical and specific. Avoid generic advice.",
        "Return ONLY valid JSON matching the required schema. Do not include markdown or extra text.",
        "Schema:",
        "{",
        '  "verdict": "Proceed" | "Proceed with Caution" | "Not Recommended",',
        '  "confidence": number,',
        '  "feasibilityScore": number,',
        '  "summary": string,',
        '  "keyClaims": [{"claim": string, "domain": "technical"|"economic"|"timeline"|"legal"|"operational"|"unknown", "assumptions": string[]}],',
        '  "contradictions": string[],',
        '  "risks": [{"title": string, "severity": "low"|"medium"|"high", "whyItMatters": string, "mitigation": string}],',
        '  "missingInfo": string[],',
        '  "recommendedNextSteps": string[]',
        "}",
    ].join("\n");
}

async function callOpenRouter(params: { apiKey: string; messages: ChatMessage[] }) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${params.apiKey}`,
            "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
            "X-Title": "Multimodal Adversarial AI",
        },
        body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            messages: params.messages,
            temperature: 0.4,
        }),
    });

    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
        const message =
            isRecord(data) &&
            isRecord(data.error) &&
            typeof data.error.message === "string"
                ? data.error.message
                : "OpenRouter request failed";
        throw new Error(message);
    }

    const content =
        isRecord(data) &&
        Array.isArray(data.choices) &&
        isRecord(data.choices[0]) &&
        isRecord((data.choices[0] as Record<string, unknown>).message) &&
        typeof ((data.choices[0] as Record<string, unknown>).message as Record<string, unknown>).content === "string"
            ? (((data.choices[0] as Record<string, unknown>).message as Record<string, unknown>).content as string)
            : undefined;
    if (typeof content !== "string" || !content.trim()) {
        throw new Error("OpenRouter returned empty content");
    }
    return content;
}

function toGeminiRole(role: ChatMessage["role"]) {
    if (role === "assistant") return "model";
    return "user";
}

type RetryableError = Error & { retryable?: boolean; status?: number; model?: string };

const GEMINI_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const GEMINI_MODEL_CANDIDATES = [
    process.env.GEMINI_MODEL,
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
].filter((m): m is string => typeof m === "string" && m.trim().length > 0);
const GEMINI_RETRIES_PER_MODEL = 2;
const GEMINI_RETRY_BASE_DELAY_MS = 600;

function isGeminiTransientMessage(message: string) {
    const lowered = message.toLowerCase();
    return (
        lowered.includes("high demand") ||
        lowered.includes("temporarily") ||
        lowered.includes("try again") ||
        lowered.includes("rate") ||
        lowered.includes("quota") ||
        lowered.includes("unavailable")
    );
}

function toRetryableError(error: unknown): RetryableError {
    if (error instanceof Error) return error as RetryableError;
    return new Error("Unknown Gemini error") as RetryableError;
}

async function callGeminiOnce(params: {
    apiKey: string;
    model: string;
    system: string;
    messages: ChatMessage[];
}) {
    const url = new URL(
        `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent`
    );
    url.searchParams.set("key", params.apiKey);

    const contents = params.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
            role: toGeminiRole(m.role),
            parts: [{ text: m.content }],
        }));

    const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            systemInstruction: {
                parts: [{ text: params.system }],
            },
            contents,
            generationConfig: {
                temperature: 0.4,
            },
        }),
    });

    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
        const message =
            isRecord(data) &&
            isRecord(data.error) &&
            typeof data.error.message === "string"
                ? data.error.message
                : "Gemini request failed";
        const err = new Error(message) as RetryableError;
        err.status = res.status;
        err.model = params.model;
        err.retryable = GEMINI_RETRYABLE_STATUSES.has(res.status) || isGeminiTransientMessage(message);
        throw err;
    }

    const candidates = isRecord(data) ? (data.candidates as unknown) : undefined;
    const firstCandidate = Array.isArray(candidates) ? candidates[0] : undefined;
    const content = isRecord(firstCandidate) ? (firstCandidate.content as unknown) : undefined;
    const parts = isRecord(content) ? (content.parts as unknown) : undefined;
    const text = Array.isArray(parts)
        ? parts
              .map((p) => (isRecord(p) ? readString(p.text) : undefined))
              .filter((x): x is string => typeof x === "string")
              .join("")
        : "";
    if (typeof text !== "string" || !text.trim()) {
        throw new Error("Gemini returned empty content");
    }
    return text;
}

async function callGemini(params: { apiKey: string; system: string; messages: ChatMessage[] }) {
    let lastError: RetryableError | null = null;

    for (let modelIndex = 0; modelIndex < GEMINI_MODEL_CANDIDATES.length; modelIndex += 1) {
        const model = GEMINI_MODEL_CANDIDATES[modelIndex];

        for (let attempt = 0; attempt <= GEMINI_RETRIES_PER_MODEL; attempt += 1) {
            try {
                return await callGeminiOnce({
                    apiKey: params.apiKey,
                    model,
                    system: params.system,
                    messages: params.messages,
                });
            } catch (error) {
                const retryableError = toRetryableError(error);
                lastError = retryableError;

                const shouldRetrySameModel =
                    Boolean(retryableError.retryable) && attempt < GEMINI_RETRIES_PER_MODEL;

                if (shouldRetrySameModel) {
                    const retryDelay = GEMINI_RETRY_BASE_DELAY_MS * (attempt + 1);
                    await sleep(retryDelay);
                    continue;
                }

                break;
            }
        }

        const hasNextModel = modelIndex < GEMINI_MODEL_CANDIDATES.length - 1;
        if (hasNextModel) {
            await sleep(300);
        }
    }

    const detail =
        lastError?.message?.trim() || "Gemini request failed after retry and fallback attempts.";
    throw new Error(`Gemini error: ${detail}`);
}

async function callProvider(provider: Provider, params: { apiKey: string; system: string; messages: ChatMessage[] }) {
    if (provider === "openrouter") {
        return callOpenRouter({
            apiKey: params.apiKey,
            messages: [{ role: "system", content: params.system }, ...params.messages.filter((m) => m.role !== "system")],
        });
    }
    return callGemini({ apiKey: params.apiKey, system: params.system, messages: params.messages });
}

export async function POST(req: NextRequest) {
    try {
        const bodyUnknown = (await req.json()) as unknown;
        const body = isRecord(bodyUnknown) ? bodyUnknown : {};

        const provider = readString(body.provider) as Provider | undefined;
        const apiKey = (readString(body.apiKey) ?? "").trim();
        const prompt = (readString(body.prompt) ?? "").trim();
        const messagesRaw = readArray(body.messages) ?? [];
        const messages: ChatMessage[] = messagesRaw
            .filter(
                (m) =>
                    isRecord(m) &&
                    isChatRole(m.role) &&
                    typeof m.content === "string"
            )
            .map((m) => ({
                role: (m as Record<string, unknown>).role as ChatMessage["role"],
                content: (m as Record<string, unknown>).content as string,
            }));

        if (provider !== "openrouter" && provider !== "gemini") {
            return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
        }
        if (!apiKey) {
            return NextResponse.json({ error: "Missing API key" }, { status: 400 });
        }
        if (!prompt && messages.length === 0) {
            return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
        }

        const userPrompt = prompt || messages.filter((m) => m.role === "user").at(-1)?.content || "";
        const history: ChatMessage[] = messages.length
            ? messages.slice(-20)
            : [{ role: "user", content: userPrompt }];

        const startedAt = Date.now();

        const answer = await callProvider(provider, {
            apiKey,
            system: buildGeneratorSystemPrompt(),
            messages: history,
        });

        // Add a small pacing gap between sequential upstream calls to reduce burst failures.
        if (provider === "gemini") {
            await sleep(350);
        }

        const critiqText = await callProvider(provider, {
            apiKey,
            system: buildCritiqSystemPrompt(),
            messages: [
                {
                    role: "user",
                    content: [
                        "User request:",
                        userPrompt,
                        "\nAssistant answer to verify:",
                        answer,
                    ].join("\n"),
                },
            ],
        });

        const parsed = extractFirstJsonObject(critiqText);
        const critiq = normalizeCritiqResult(parsed ?? {});

        return NextResponse.json({
            answer,
            critiq,
            responseTimeMs: Date.now() - startedAt,
        });
    } catch (error) {
        console.error("API /compare-ai error:", error);
        const message = error instanceof Error ? error.message : "Server error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
