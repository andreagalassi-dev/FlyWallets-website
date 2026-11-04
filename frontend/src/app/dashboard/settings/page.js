"use client";

import Link from "next/link";
import { BadgeCheck, MailWarning, LogOut, User } from "lucide-react";
import useAuthStore from "@/store/authStore";
import useLogout from "@/hooks/useLogout";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";

function Row({ label, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3 border-b border-white/5 last:border-0">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="text-sm text-white">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const isBusiness = user?.user_type?.toLowerCase() === "business";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Settings</h1>
        <p className="text-gray-400">Your account and session.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Account</CardTitle>
          <CardDescription>Details you signed up with.</CardDescription>
        </CardHeader>
        <CardContent>
          <Row label="E-mail">{user?.email || "—"}</Row>
          <Row label="E-mail status">
            {user?.email_verified === true && (
              <span className="inline-flex items-center gap-1.5 text-green-400"><BadgeCheck size={14} /> Verified</span>
            )}
            {user?.email_verified === false && (
              <span className="inline-flex items-center gap-2 text-primary">
                <MailWarning size={14} /> Not verified
                <Link href="/register/verify-email" className="underline underline-offset-2 hover:text-white">Verify now</Link>
              </span>
            )}
            {user?.email_verified == null && "—"}
          </Row>
          <Row label="Account type">{user ? (isBusiness ? "Business" : "Individual") : "—"}</Row>
          <div className="pt-4">
            <Link href="/dashboard/profile">
              <Button variant="secondary" size="sm"><User size={14} className="mr-2" /> Edit profile</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Appearance</CardTitle>
          <CardDescription>FlyWallets currently comes with a single dark theme. Other themes are coming soon.</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Notifications</CardTitle>
          <CardDescription>E-mail and in-app notification preferences are coming soon.</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Session</CardTitle>
          <CardDescription>Sign out of FlyWallets on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="danger" onClick={logout}><LogOut size={16} className="mr-2" /> Log out</Button>
        </CardContent>
      </Card>
    </div>
  );
}
