import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";

/* Load order is deliberate and must be preserved:
 *   1. reset            2. tokens (the only place --nx-* is defined)
 *   3. component layers 4. print
 * There is no override layer: the component CSS consumes tokens directly. */
import "./globals.css";
import "./tokens.css";
import "./prototype-extra.css";
import "./commerce.css";
import "./master-data.css";
import "./banking.css";
import "./banking-grid.css";
import "./banking-reconciliation.css";
import "./hr.css";
import "./hr-lifecycle.css";
import "./hr-reporting.css";
import "./nexora-intelligence.css";
import "./nexora-ai-workspace.css";
import "./form-workspace.css";
import "./document-workbench.css";
import "./enterprise-transaction-control.css";
import "./document-template.css";
import "./drill.css";
import "./dashboard-comparison.css";
import "./reports-workspace.css";
import "./manufacturing-workspace.css";
import "./form-contrast.css";
import "./print.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/* Serif display face. Page and report titles are set in it; the data interface
 * stays in the grotesque. This pairing is what moves the register from
 * "dashboard" to "institution". */
const nexoraSerif = Source_Serif_4({
  variable: "--font-nx-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nexora ERP - Enterprise Operations",
  description: "Nexora's secure, role-aware enterprise operations web application.",
  openGraph: {
    title: "Nexora ERP - Enterprise Operations",
    description: "Secure, role-aware enterprise operations for Nexora teams.",
    type: "website",
    images: [{ url: "/og.png", width: 1734, height: 907, alt: "Nexora ERP role-aware command centre" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexora ERP - Enterprise Operations",
    description: "Secure, role-aware enterprise operations for Nexora teams.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${nexoraSerif.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
