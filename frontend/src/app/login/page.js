"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
// import { useForm } from "react-hook-form"; // Removed unused import
import Link from "next/link";
import api from "@/lib/api";
import useAuthStore from "@/store/authStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Loader2 } from "lucide-react";
import Logo from "@/components/brand/Logo";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await api.post("/auth/login", formData);
      if (res.data.status === "success") {
        login(res.data.data.user);
        router.push("/dashboard");
      }
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.message || "Something went wrong";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[url('/bg-abstract.jpg')] bg-cover bg-center">
      {/* Background placeholder - assumes user might add one, otherwise fallback to global dark css */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

      <div className="relative w-full max-w-md px-4">
        <div className="text-center mb-8">
          <h1 className="mb-3 flex justify-center">
            <Logo href="/" size={34} />
          </h1>
          <p className="text-gray-400">Professional Financial Mastery</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome Back</CardTitle>
            <CardDescription>
              Enter your credentials to access your dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded-md">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  Email
                </label>
                <Input
                  name="email"
                  type="email"
                  placeholder="name@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-gray-300">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-sm text-gray-400">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-primary hover:underline">
                Register now
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
