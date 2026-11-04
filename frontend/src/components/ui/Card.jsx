import { twMerge } from "tailwind-merge";

export function Card({ className, children, ...props }) {
  return (
    <div className={twMerge("glass-card p-6", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }) {
  return <div className={twMerge("mb-4", className)} {...props}>{children}</div>;
}

export function CardTitle({ className, children, ...props }) {
  return <h3 className={twMerge("text-2xl font-semibold leading-none tracking-tight text-white", className)} {...props}>{children}</h3>;
}

export function CardDescription({ className, children, ...props }) {
  return <p className={twMerge("text-sm text-gray-400 mt-1", className)} {...props}>{children}</p>;
}

export function CardContent({ className, children, ...props }) {
  return <div className={twMerge("", className)} {...props}>{children}</div>;
}

export function CardFooter({ className, children, ...props }) {
  return <div className={twMerge("mt-6 flex items-center", className)} {...props}>{children}</div>;
}
