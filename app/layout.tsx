import type { Metadata } from "next";
import { Geist_Mono, Source_Sans_3 } from "next/font/google";

import { TooltipProvider } from "./components/ui/tooltip";
import { SessionProvider } from "./lib/session/session-provider";
import { appUrl } from "./shared/config/runtime";
import { themeInitializationScript } from "./shared/theme/config";
import { ThemeProvider } from "./shared/theme/provider";
import { application } from "./shared/constants/application";

/* Load order is deliberate and must be preserved:
 *   1. reset            2. color, typography, and geometry tokens
 *   3. shared controls  4. component layers  5. print
 * There is no override layer: the component CSS consumes tokens directly. */
import "./shared/styles/globals.css";
import "./shared/styles/theme-colors.css";
import "./shared/styles/typography.css";
import "./shared/styles/tokens.css";
import "./shared/styles/theme-controls.css";
import "./shell/styles/prototype-extra.css";
import "./features/commerce/styles/commerce.css";
import "./features/master-data/styles/master-data.css";
import "./features/banking/styles/banking.css";
import "./features/banking/styles/banking-grid.css";
import "./features/banking/styles/banking-reconciliation.css";
import "./features/ai/styles/nexora-intelligence.css";
import "./features/ai/styles/nexora-ai-workspace.css";
import "./features/drill/drill.css";
import "./features/reports/styles/reports-workspace.css";
import "./features/manufacturing/styles/manufacturing-workspace.css";
import "./shared/styles/print.css";
import "./globals.css";

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
  title: application.title,
  description: application.description,
  metadataBase: new URL(appUrl()),
  openGraph: {
    title: application.title,
    description: application.description,
    type: "website",
    images: [{ url: "/og.png", width: 1734, height: 907, alt: application.openGraphImageAlt }],
  },
  twitter: {
    card: "summary_large_image",
    title: application.title,
    description: application.description,
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
    <html lang="en" className={`${nexoraSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script id="nexora-theme-init" dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <TooltipProvider>
            <SessionProvider>{children}</SessionProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
