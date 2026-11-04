"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import useAuthStore from "@/store/authStore";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Loader2 } from "lucide-react";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;
const DEFAULT_LOCK_SECONDS = 15 * 60; // backend locks for 15 minutes after 3 wrong attempts
const EMPTY_CODE = Array(CODE_LENGTH).fill("");

const formatCountdown = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export default function VerifyEmailPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [digits, setDigits] = useState(EMPTY_CODE);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [lockSeconds, setLockSeconds] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(RESEND_COOLDOWN_SECONDS);
  const inputsRef = useRef([]);

  const locked = lockSeconds > 0;
  const code = digits.join("");

  // One shared 1s ticker while any countdown is running
  const ticking = locked || resendSeconds > 0;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => {
      setLockSeconds((s) => Math.max(s - 1, 0));
      setResendSeconds((s) => Math.max(s - 1, 0));
    }, 1000);
    return () => clearInterval(id);
  }, [ticking]);

  const applyLock = (data) => {
    const seconds = Number(data?.retryAfterSeconds) || DEFAULT_LOCK_SECONDS;
    setLockSeconds(seconds);
    setDigits(EMPTY_CODE);
  };

  const submit = async (value) => {
    if (loading || locked) return;
    setLoading(true);
    setError("");
    setInfo("");
    try {
      await api.post("/auth/verify-email", { code: value });
      updateUser({ email_verified: true });
      toast.success("Email verified. Welcome to FlyWallets!");
      router.push("/dashboard");
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 429) {
        applyLock(data);
        setError(getErrorMessage(err));
      } else {
        setError(
          typeof data?.attemptsLeft === "number"
            ? `${getErrorMessage(err)}. ${data.attemptsLeft} ${data.attemptsLeft === 1 ? "attempt" : "attempts"} left.`
            : getErrorMessage(err)
        );
        setDigits(EMPTY_CODE);
        inputsRef.current[0]?.focus();
      }
    } finally {
      setLoading(false);
    }
  };

  const updateDigits = (next) => {
    setDigits(next);
    if (next.every(Boolean)) submit(next.join(""));
  };

  const handleChange = (index, e) => {
    const typed = e.target.value.replace(/\D/g, "");
    if (!typed) return;
    // Typing (or autofill) of several digits fills the following boxes
    const next = [...digits];
    typed
      .slice(0, CODE_LENGTH - index)
      .split("")
      .forEach((d, i) => {
        next[index + i] = d;
      });
    const focusAt = Math.min(index + typed.length, CODE_LENGTH - 1);
    inputsRef.current[focusAt]?.focus();
    updateDigits(next);
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = "";
      } else if (index > 0) {
        next[index - 1] = "";
        inputsRef.current[index - 1]?.focus();
      }
      setDigits(next);
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = [...EMPTY_CODE];
    pasted.split("").forEach((d, i) => {
      next[i] = d;
    });
    inputsRef.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
    updateDigits(next);
  };

  const handleResend = async () => {
    setResending(true);
    setError("");
    setInfo("");
    try {
      await api.post("/auth/resend-verification");
      setInfo("A new code has been sent to your email.");
      setDigits(EMPTY_CODE);
      setResendSeconds(RESEND_COOLDOWN_SECONDS);
      inputsRef.current[0]?.focus();
    } catch (err) {
      if (err.response?.status === 429 && err.response?.data?.retryAfterSeconds) {
        applyLock(err.response.data);
      }
      setError(getErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[url('/bg-abstract.jpg')] bg-cover bg-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

      <div className="relative w-full max-w-md px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">FlyWallets</h1>
          <p className="text-gray-400">Professional Financial Mastery</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Verify your email</CardTitle>
            <CardDescription>
              Enter the 6-digit code we sent to{" "}
              <span className="text-white font-medium" suppressHydrationWarning>
                {user?.email || "your email address"}
              </span>
              . It expires in 10 minutes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div
                role="alert"
                className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded-md"
              >
                {error}
              </div>
            )}
            {info && !error && (
              <div
                role="status"
                className="p-3 bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-md"
              >
                {info}
              </div>
            )}
            {locked && (
              <p role="status" className="text-sm text-center text-gray-300">
                Too many wrong attempts. Try again in{" "}
                <span className="font-mono text-primary">{formatCountdown(lockSeconds)}</span>
              </p>
            )}

            <div
              role="group"
              aria-label="6-digit verification code"
              className="flex justify-between gap-2"
            >
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputsRef.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
                  maxLength={CODE_LENGTH}
                  value={digit}
                  autoFocus={index === 0}
                  disabled={locked || loading}
                  onChange={(e) => handleChange(index, e)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  onFocus={(e) => e.target.select()}
                  className="h-12 w-full min-w-0 rounded-md border border-white/10 bg-black/20 text-center text-xl font-semibold text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                />
              ))}
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={loading || locked || code.length < CODE_LENGTH}
              onClick={() => submit(code)}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Verify Email"}
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || resendSeconds > 0 || locked}
                className="text-primary hover:underline disabled:text-gray-500 disabled:no-underline disabled:cursor-not-allowed"
              >
                {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code"}
              </button>
              <Link href="/dashboard" className="text-gray-400 hover:text-white">
                Skip for now
              </Link>
            </div>

            {process.env.NODE_ENV !== "production" && (
              <p className="text-xs text-gray-600 text-center">
                Dev tip: without SMTP configured, the code is printed in the backend console.
              </p>
            )}
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-sm text-gray-400">You can verify your email later from your account.</p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
