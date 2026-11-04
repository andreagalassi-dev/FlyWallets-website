import { create } from "zustand";

let nextId = 1;

const useToastStore = create((set, get) => ({
  toasts: [],
  // opts.action = { label, href } adds a link to the toast; opts.once skips it if the same message is already shown
  push: (type, message, duration = 4000, opts = {}) => {
    const existing = opts.once && get().toasts.find((t) => t.type === type && t.message === message);
    if (existing) return existing.id;
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, type, message, action: opts.action }] }));
    if (duration > 0) setTimeout(() => get().dismiss(id), duration);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Usable anywhere (event handlers, interceptors): toast.success("Saved")
export const toast = {
  success: (message) => useToastStore.getState().push("success", message),
  error: (message, opts) => useToastStore.getState().push("error", message, 6000, opts),
  info: (message) => useToastStore.getState().push("info", message),
};

export default useToastStore;

// A toast that must survive a full page navigation (e.g. window.location redirect to /login):
// stored in sessionStorage and shown by <Toaster /> on the next page load.
const FLASH_KEY = "fw-flash-toast";

export function flashToast(type, message) {
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify({ type, message }));
  } catch {
    /* storage unavailable: the redirect still happens, just without the toast */
  }
}

export function showFlashToast() {
  try {
    const raw = sessionStorage.getItem(FLASH_KEY);
    if (!raw) return;
    sessionStorage.removeItem(FLASH_KEY);
    const { type, message } = JSON.parse(raw);
    if (message) useToastStore.getState().push(type === "error" ? "error" : "info", message, 6000, { once: true });
  } catch {
    /* ignore malformed data */
  }
}
