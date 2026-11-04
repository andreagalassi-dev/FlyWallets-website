import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/Toaster";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const description =
  "FlyWallets is open-source personal finance: accounts, transactions sorted into categories automatically, savings goals, budgets and clear monthly charts.";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "FlyWallets · Personal finance, sorted",
    template: "%s · FlyWallets",
  },
  description,
  applicationName: "FlyWallets",
  openGraph: {
    type: "website",
    siteName: "FlyWallets",
    title: "FlyWallets · Personal finance, sorted",
    description,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "FlyWallets · Personal finance, sorted",
    description,
  },
};

export const viewport = {
  themeColor: "#0d0d15",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans bg-background text-foreground antialiased selection:bg-primary selection:text-black`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
