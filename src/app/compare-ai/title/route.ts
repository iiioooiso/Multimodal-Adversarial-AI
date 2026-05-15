import { NextRequest, NextResponse } from "next/server";

type Provider = "openrouter" | "gemini";

type ChatMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
    return typeof value === "string" ? value : undefined;
}

function toGeminiRole(role: ChatMessage["role"]) {
    if (role === "assistant") return "model";
    return "user";
}

function sanitizeTitle(raw: string) {
    const cleaned = raw
        .replace(/^"+|"+$/g, "")
        .replace(/^'+|'+$/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (!cleaned) return "Untitled conversation";
    return cleaned.slice(0, 80);
}

function buildFallbackTitle(prompt: string, answer: string) {
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

async function callOpenRouter(apiKey: string, prompt: string) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
            "X-Title": "Multimodal Adversarial AI",
        },
        body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            temperature: 0.2,
            messages: [
                {
                    role: "system",
                    content:
                        "Create a short conversation title from the user request and assistant answer. Return plain text only, max 6 words, no punctuation at the end.",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
        }),
    });

    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
        const message =
            isRecord(data) && isRecord(data.error) && typeof data.error.message === "string"
                ? data.error.message
                : "OpenRouter request failed";
        throw new Error(message);
    }

    const content =
        isRecord(data) &&
        Array.isArray(data.choices) &&
        isRecord(data.choices[0]) &&
        isRecord((data.choices[0] as Record<string, unknown>).message) &&
        typeof ((data.choices[0] as Record<string, unknown>).message as Record<string, unknown>).content ===
            "string"
            ? (((data.choices[0] as Record<string, unknown>).message as Record<string, unknown>)
                  .content as string)
            : "";

    return sanitizeTitle(content);
}

async function callGemini(apiKey: string, prompt: string) {
    const candidates = [
        process.env.GEMINI_MODEL,
        "gemini-2.0-flash-lite",
        "gemini-2.0-flash",
        "gemini-2.5-flash-lite",
    ].filter((m): m is string => typeof m === "string" && m.trim().length > 0);

    let lastError = "Gemini request failed";

    for (const model of candidates) {
        const url = new URL(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
        );
        url.searchParams.set("key", apiKey);

        const res = await fetch(url.toString(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [
                        {
                            text: "Create a short conversation title from the user request and assistant answer. Return plain text only, max 6 words, no punctuation at the end.",
                        },
                    ],
                },
                contents: [
                    {
                        role: toGeminiRole("user"),
                        parts: [{ text: prompt }],
                    },
                ],
                generationConfig: {
                    temperature: 0.2,
                },
            }),
        });

        const data = (await res.json().catch(() => null)) as unknown;
        if (!res.ok) {
            lastError =
                isRecord(data) && isRecord(data.error) && typeof data.error.message === "string"
                    ? data.error.message
                    : "Gemini request failed";
            continue;
        }

        const modelCandidates = isRecord(data) ? (data.candidates as unknown) : undefined;
        const firstCandidate = Array.isArray(modelCandidates) ? modelCandidates[0] : undefined;
        const content = isRecord(firstCandidate) ? (firstCandidate.content as unknown) : undefined;
        const parts = isRecord(content) ? (content.parts as unknown) : undefined;
        const text = Array.isArray(parts)
            ? parts
                  .map((p) => (isRecord(p) ? readString(p.text) : undefined))
                  .filter((x): x is string => typeof x === "string")
                  .join("")
            : "";

        if (text.trim()) {
            return sanitizeTitle(text);
        }
    }

    throw new Error(lastError);
}

export async function POST(req: NextRequest) {
    try {
        const bodyUnknown = (await req.json()) as unknown;
        const body = isRecord(bodyUnknown) ? bodyUnknown : {};

        const provider = readString(body.provider) as Provider | undefined;
        const apiKey = (readString(body.apiKey) ?? "").trim();
        const prompt = (readString(body.prompt) ?? "").trim();
        const answer = (readString(body.answer) ?? "").trim();

        if (provider !== "openrouter" && provider !== "gemini") {
            return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
        }
        if (!apiKey) {
            return NextResponse.json({ error: "Missing API key" }, { status: 400 });
        }
        if (!prompt) {
            return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
        }

        const titlePrompt = [
            "User request:",
            prompt,
            "",
            "Assistant answer (optional context):",
            answer || "N/A",
        ].join("\n");

        const title = await (async () => {
            try {
                return provider === "openrouter"
                    ? await callOpenRouter(apiKey, titlePrompt)
                    : await callGemini(apiKey, titlePrompt);
            } catch {
                return buildFallbackTitle(prompt, answer);
            }
        })();

        return NextResponse.json({ title: sanitizeTitle(title) });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Server error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
