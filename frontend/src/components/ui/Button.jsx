import { twMerge } from 'tailwind-merge';

export function Button({ className, variant = 'primary', size = 'default', children, ...props }) {
  const baseStyles = "inline-flex items-center justify-center rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-primary text-black hover:bg-primary-hover shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:shadow-[0_0_20px_rgba(212,175,55,0.5)]",
    secondary: "bg-surface text-white border border-white/10 hover:bg-white/10",
    ghost: "bg-transparent hover:bg-white/5 text-gray-300 hover:text-white",
    danger: "bg-accent-light/10 text-accent-light border border-accent-light/20 hover:bg-accent-light/20",
  };

  const sizes = {
    default: "h-10 px-4 py-2",
    sm: "h-8 px-3 text-sm",
    lg: "h-12 px-6 text-lg",
    icon: "h-10 w-10",
  };

  return (
    <button className={twMerge(baseStyles, variants[variant], sizes[size], className)} {...props}>
      {children}
    </button>
  );
}
