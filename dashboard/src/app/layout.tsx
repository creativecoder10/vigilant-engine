import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://vigilant-engine-c8fgdom0q-sec-engg.vercel.app";
const SITE_DESCRIPTION =
  "Open-source AppSec findings dashboard aggregating SAST (Semgrep), secrets scanning (gitleaks), SCA (Snyk, npm audit), DAST (OWASP ZAP), and container scanning (Trivy) results from OWASP Juice Shop into one view.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "vigilant-engine — AppSec findings dashboard",
  description: SITE_DESCRIPTION,
  keywords: [
    "AppSec",
    "DevSecOps",
    "security dashboard",
    "SAST",
    "DAST",
    "SCA",
    "Semgrep",
    "OWASP ZAP",
    "gitleaks",
    "Snyk",
    "Trivy",
    "OWASP Juice Shop",
  ],
  authors: [{ name: "Deepesh Dang" }],
  openGraph: {
    title: "vigilant-engine — AppSec findings dashboard",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "vigilant-engine",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "vigilant-engine — AppSec findings dashboard",
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
