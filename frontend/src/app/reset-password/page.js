"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { scorePassword } from "@/lib/passwordStrength";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordStrength } from "@/components/ui/PasswordStrength";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Loader2, TriangleAlert } from "lucide-react";

function LinkProblem({ title, message }) {
  return (
    <>
      <CardHeader>
        <div className="flex justify-center mb-2">
          <TriangleAlert className="h-10 w-10 text-red-500" aria-hidden="true" />
        </div>
        <CardTitle className="text-center">{title}</CardTitle>
        <CardDescription className="text-center">{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/forgot-password" className="block">
          <Button type="button" className="w-full">
            Request a new link
          </Button>
        </Link>
      </CardContent>
    </>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [linkInvalid, setLinkInvalid] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!scorePassword(password).valid) {
      setError("Password does not meet all the requirements");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Password updated. You can now log in.");
      router.push("/login");
    } catch (err) {
      if (err.response?.status === 400 && !Array.isArray(err.response?.data?.errors)) {
        setLinkInvalid(true);
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <LinkProblem
        title="Missing reset link"
        message="This page needs a valid reset link. Open the link from your email or request a new one."
      />
    );
  }

  if (linkInvalid) {
    return (
      <LinkProblem
        title="Link invalid or expired"
        message="This password reset link is no longer valid. Request a new one to continue."
      />
    );
  }

  return (
    <>
      <CardHeader>
        <CardTitle>Reset Password</CardTitle>
        <CardDescription>Choose a new password for your account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded-md"
            >
              {error}
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-gray-300">
              New password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <PasswordStrength password={password} />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirm_password" className="text-sm font-medium text-gray-300">
              Confirm new password
            </label>
            <Input
              id="confirm_password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Update Password"}
          </Button>
        </form>
      </CardContent>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[url('/bg-abstract.jpg')] bg-cover bg-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

      <div className="relative w-full max-w-md px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">FlyWallets</h1>
          <p className="text-gray-400">Professional Financial Mastery</p>
        </div>

        <Card>
          <Suspense
            fallback={
              <CardContent className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </CardContent>
            }
          >
            <ResetPasswordForm />
          </Suspense>
          <CardFooter className="justify-center">
            <Link href="/login" className="text-sm text-primary hover:underline">
              Back to Log In
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
