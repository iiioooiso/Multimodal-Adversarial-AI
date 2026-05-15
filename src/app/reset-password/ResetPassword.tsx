// app/reset-password/ResetPassword.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePassword } from "./actions";

interface ResetPasswordProps {
    code: string | null;
}

export default function ResetPassword({ code }: ResetPasswordProps) {
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState<string | null>(null);
    const [isClient, setIsClient] = useState(false);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        setIsClient(true);
        if (!code) router.push("/forgot-password");
        const timer = setTimeout(() => setLoading(false), 1);
        return () => clearTimeout(timer);
    }, [code, router]);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!code) return;

        const formData = new FormData(e.currentTarget);
        const newPass = formData.get("new_password") as string;
        const confirmPass = formData.get("confirm_password") as string;

        if (newPass !== confirmPass) {
            setMessage("Passwords do not match!");
            return;
        }

        formData.append("code", code);

        startTransition(async () => {
            const res = await updatePassword(formData);
            if (res?.success) {
                setMessage("Password updated! Redirecting to login...");
                setTimeout(() => router.push("/login"), 2000);
            } else {
                setMessage("Please use a password you haven't used before.");
            }
        });
    };

    if (!isClient || loading) {
        return (
            <main className="min-h-screen w-full flex items-center justify-center px-4 bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-white">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/70">
                    Loading…
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen w-full bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-white flex items-center justify-center px-4">
            <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
                <h1 className="text-xl font-semibold tracking-tight">Set a new password</h1>
                <p className="mt-2 text-sm text-white/60">
                    Choose a strong password you haven’t used before.
                </p>

                {message ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/70">
                        {message}
                    </div>
                ) : null}

                <div className="mt-4">
                    <label htmlFor="new_password" className="mb-1 block text-xs font-medium text-white/70">
                        New password
                    </label>
                    <input
                        id="new_password"
                        name="new_password"
                        type="password"
                        required
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/10"
                    />
                </div>
                <div className="mt-3">
                    <label htmlFor="confirm_password" className="mb-1 block text-xs font-medium text-white/70">
                        Confirm password
                    </label>
                    <input
                        id="confirm_password"
                        name="confirm_password"
                        type="password"
                        required
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/10"
                    />
                </div>

                <button
                    type="submit"
                    disabled={isPending}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/15 disabled:opacity-60"
                >
                    {isPending ? "Updating…" : "Update password"}
                </button>
            </form>
        </main>
    );
}
