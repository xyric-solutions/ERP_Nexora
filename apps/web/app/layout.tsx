import LegacyLayout, { metadata as legacyMetadata } from "../../../app/layout";
import { SessionProvider } from "../src/lib/session/session-provider";

export const metadata = {
  ...legacyMetadata,
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <LegacyLayout>
      <SessionProvider>{children}</SessionProvider>
    </LegacyLayout>
  );
}
