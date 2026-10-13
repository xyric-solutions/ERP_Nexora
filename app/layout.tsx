import type { Metadata } from "next";
import { Geist_Mono, Source_Sans_3 } from "next/font/google";

import { themeInitializationScript } from "./theme-config";
import { ThemeProvider } from "./theme-provider";

/* Load order is deliberate and must be preserved:
 *   1. reset            2. color, typography, and geometry tokens
 *   3. shared controls  4. component layers  5. print
 * There is no override layer: the component CSS consumes tokens directly. */
import "./globals.css";
import "./theme-colors.css";
import "./typography.css";
import "./tokens.css";
import "./theme-controls.css";
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

const nexoraSans = Source_Sans_3({
  variable: "--font-nx-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script id="nexora-theme-init" dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body className={`${nexoraSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
