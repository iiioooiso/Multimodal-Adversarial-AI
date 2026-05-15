import { NextRequest, NextResponse } from "next/server";

type Provider = "openrouter" | "gemini";

type ChatMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};

type CritiqVerdict = "Proceed" | "Proceed with Caution" | "Not Recommended";

type CritiqResult = {
    verdict: CritiqVerdict;
    confidence: number;
    feasibilityScore: number;
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

type RetryableError = Error & { retryable?: boolean };

const GEMINI_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const GEMINI_MODEL_CANDIDATES = [
    process.env.GEMINI_MODEL,
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
].filter((m): m is string => typeof m === "string" && m.trim().length > 0);

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

    const confidenceFallback = verdict === "Proceed" ? 78 : verdict === "Not Recommended" ? 38 : 62;
    const feasibilityFallback = verdict === "Proceed" ? 74 : verdict === "Not Recommended" ? 32 : 56;
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

function toGeminiRole(role: ChatMessage["role"]) {
    if (role === "assistant") return "model";
    return "user";
}

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

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeRetryableError(message: string, status: number): RetryableError {
    const err = new Error(message) as RetryableError;
    err.retryable = GEMINI_RETRYABLE_STATUSES.has(status) || isGeminiTransientMessage(message);
    return err;
}

function extractGeminiTextFromChunk(parsed: unknown) {
    if (!isRecord(parsed)) return "";
    const candidates = parsed.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) return "";

    const firstCandidate = candidates[0];
    if (!isRecord(firstCandidate)) return "";

    const content = firstCandidate.content;
    if (!isRecord(content)) return "";

    const parts = content.parts;
    if (!Array.isArray(parts)) return "";

    return parts
        .map((part) => (isRecord(part) ? readString(part.text) : undefined))
        .filter((text): text is string => typeof text === "string")
        .join("");
}

async function callGeminiNonStream(params: {
    apiKey: string;
    system: string;
    messages: ChatMessage[];
}) {
    let lastError: Error | null = null;

    for (const model of GEMINI_MODEL_CANDIDATES) {
        try {
            const url = new URL(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
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
                    isRecord(data) && isRecord(data.error) && typeof data.error.message === "string"
                        ? data.error.message
                        : "Gemini request failed";
                throw makeRetryableError(message, res.status);
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

            if (!text.trim()) {
                throw new Error("Gemini returned empty content");
            }
            return text;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error("Gemini request failed");
            await sleep(250);
        }
    }

    throw lastError ?? new Error("Gemini request failed");
}

async function streamGeminiAnswer(params: {
    apiKey: string;
    system: string;
    messages: ChatMessage[];
    onDelta: (delta: string) => void;
}) {
    let lastError: Error | null = null;

    for (const model of GEMINI_MODEL_CANDIDATES) {
        try {
            const url = new URL(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`
            );
            url.searchParams.set("alt", "sse");
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

            if (!res.ok || !res.body) {
                const data = (await res.json().catch(() => null)) as unknown;
                const message =
                    isRecord(data) && isRecord(data.error) && typeof data.error.message === "string"
                        ? data.error.message
                        : "Gemini stream request failed";
                throw makeRetryableError(message, res.status);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let answer = "";
            let debugChunkCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("data:")) continue;

                    const payload = trimmed.slice(5).trim();
                    if (!payload || payload === "[DONE]") continue;

                    if (debugChunkCount < 5) {
                        console.log("[compare-ai/stream] raw chunk", payload.slice(0, 400));
                        debugChunkCount += 1;
                    }

                    try {
                        const parsed = JSON.parse(payload) as unknown;
                        const text = extractGeminiTextFromChunk(parsed);
                        if (!text) {
                            const fallbackText =
                                isRecord(parsed) && typeof parsed.text === "string"
                                    ? parsed.text
                                    : "";
                            if (fallbackText) {
                                const delta = fallbackText.startsWith(answer)
                                    ? fallbackText.slice(answer.length)
                                    : fallbackText;
                                if (delta) {
                                    answer += delta;
                                    params.onDelta(delta);
                                }
                            }
                            continue;
                        }

                        const delta = text.startsWith(answer) ? text.slice(answer.length) : text;
                        if (!delta) continue;
                        answer += delta;
                        params.onDelta(delta);
                    } catch (parseError) {
                        console.log("[compare-ai/stream] chunk parse error", {
                            payloadPreview: payload.slice(0, 180),
                            error: parseError instanceof Error ? parseError.message : String(parseError),
                        });
                    }
                }
            }

            if (!answer.trim()) {
                console.warn("[compare-ai/stream] stream empty, falling back to non-stream call");
                answer = await callGeminiNonStream({
                    apiKey: params.apiKey,
                    system: params.system,
                    messages: params.messages,
                });
                params.onDelta(answer);
            }

            return answer;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error("Gemini stream failed");
            await sleep(350);
        }
    }

    throw lastError ?? new Error("Gemini stream failed");
}

function sseEvent(event: string, payload: unknown) {
    return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(req: NextRequest) {
    const encoder = new TextEncoder();

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

        if (provider !== "gemini") {
            return NextResponse.json({ error: "Streaming is enabled for Gemini only." }, { status: 400 });
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

        console.log("[compare-ai/stream] start", {
            provider,
            promptPreview: userPrompt.slice(0, 120),
            messageCount: history.length,
        });

        const stream = new ReadableStream<Uint8Array>({
            start: async (controller) => {
                try {
                    controller.enqueue(
                        encoder.encode(
                            sseEvent("step", { text: "Planning response strategy and reading context..." })
                        )
                    );

                    const answer = await streamGeminiAnswer({
                        apiKey,
                        system: buildGeneratorSystemPrompt(),
                        messages: history,
                        onDelta: (delta) => {
                            controller.enqueue(encoder.encode(sseEvent("delta", { delta })));
                        },
                    });

                    console.log("[compare-ai/stream] answer", {
                        answerPreview: answer.slice(0, 240),
                        answerLength: answer.length,
                    });

                    controller.enqueue(
                        encoder.encode(
                            sseEvent("step", { text: "Running adversarial feasibility verification..." })
                        )
                    );

                    await sleep(300);

                    const critiqText = await callGeminiNonStream({
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

                    console.log("[compare-ai/stream] critiq", {
                        verdict: critiq.verdict,
                        confidence: critiq.confidence,
                        feasibilityScore: critiq.feasibilityScore,
                        summaryPreview: critiq.summary.slice(0, 160),
                    });

                    controller.enqueue(
                        encoder.encode(
                            sseEvent("done", {
                                answer,
                                critiq,
                                responseTimeMs: Date.now() - startedAt,
                            })
                        )
                    );
                    console.log("[compare-ai/stream] done", {
                        responseTimeMs: Date.now() - startedAt,
                        answerLength: answer.length,
                    });
                    controller.close();
                } catch (error) {
                    const message = error instanceof Error ? error.message : "Stream failed";
                    console.error("[compare-ai/stream] error", error);
                    controller.enqueue(encoder.encode(sseEvent("error", { error: message })));
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Server error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
