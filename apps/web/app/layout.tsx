import LegacyLayout, { metadata as legacyMetadata } from "../../../app/layout";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { SessionProvider } from "../src/lib/session/session-provider";
import { appUrl } from "../src/shared/config/runtime";

import "./globals.css";

export const metadata = {
  ...legacyMetadata,
  metadataBase: new URL(appUrl()),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <LegacyLayout>
      <TooltipProvider>
        <SessionProvider>{children}</SessionProvider>
      </TooltipProvider>
    </LegacyLayout>
  );
}
