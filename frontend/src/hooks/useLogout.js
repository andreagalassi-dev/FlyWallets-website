"use client";

import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import useAuthStore from "@/store/authStore";
import { toast } from "@/store/toastStore";

/** Returns a `logout()` function: revokes the session on the server, clears local state, goes to /login. */
export default function useLogout() {
  const router = useRouter();
  const clearUser = useAuthStore((s) => s.logout);

  return async () => {
    try {
      await api.post("/auth/logout");
      clearUser();
      router.push("/login");
    } catch (err) {
      toast.error(getErrorMessage(err, "Logout failed. Please try again."));
    }
  };
}
