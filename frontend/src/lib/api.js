import axios from "axios";
import useAuthStore from "@/store/authStore";
import { toast, flashToast } from "@/store/toastStore";
import { getErrorCode, getFriendlyErrorMessage } from "@/lib/errors";

// Create Axios Instance
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api",
  withCredentials: true, // Crucial for HttpOnly Cookies
  headers: {
    "Content-Type": "application/json",
  },
});

// One refresh at a time: parallel 401s share the same attempt
let refreshing = null;
const refreshSession = () => {
  if (!refreshing) {
    refreshing = api
      .post("/auth/refresh-token")
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
};

// Response Interceptor for Refresh Token Logic
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthCall = originalRequest?.url?.startsWith("/auth/");
    const code = getErrorCode(error);

    if (error.response?.status === 403 && typeof window !== "undefined") {
      if (code === "EMAIL_NOT_VERIFIED") {
        // A toast with a link (not a redirect): the user keeps what they typed. Shown once at a time.
        const onVerifyPage = window.location.pathname.startsWith("/register/verify-email");
        toast.error(getFriendlyErrorMessage(error), {
          once: true,
          action: onVerifyPage ? undefined : { label: "Verify now", href: "/register/verify-email" },
        });
      } else if (code === "REFRESH_TOKEN_REUSED") {
        // Server cleared the cookies: drop the local session and start over
        useAuthStore.getState().logout();
        if (window.location.pathname !== "/login") {
          flashToast("error", getFriendlyErrorMessage(error)); // a full redirect would drop an in-memory toast
          window.location.href = "/login";
        } else {
          toast.error(getFriendlyErrorMessage(error), { once: true });
        }
      }
    }

    // Only expired sessions are refreshed: never for /auth/* calls (a wrong password is also a 401,
    // and the refresh call itself must not trigger another refresh)
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthCall) {
      originalRequest._retry = true;

      try {
        await refreshSession();
        // Cookies were renewed by the server: retry the original request
        return api(originalRequest);
      } catch (refreshError) {
        // Session is really over: back to the login page
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
