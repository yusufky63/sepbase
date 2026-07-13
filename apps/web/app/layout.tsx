import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Providers } from "@/components/providers";
import { ProtocolBanner } from "@/components/protocol/protocol-banner";
import { TransactionToast } from "@/components/ui/transaction-toast";
import { projectConfig } from "@/config/project.config";
import { RenewalReminderCenter } from "@/features/renewal/renewal-reminder-center";
import { displayFont, monoFont, uiFont } from "@/lib/fonts";
import "@/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(projectConfig.siteUrl),
  title: {
    default: `${projectConfig.brand.name} / ${projectConfig.chain.name} names`,
    template: `%s / ${projectConfig.brand.name}`,
  },
  description: projectConfig.brand.description,
  icons: { icon: projectConfig.brand.favicon },
  openGraph: {
    title: projectConfig.brand.name,
    description: projectConfig.brand.description,
    type: "website",
    url: "/",
    siteName: projectConfig.brand.name,
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeStyle = {
    "--accent": projectConfig.brand.accent,
    "--focus": projectConfig.brand.accent,
  } as CSSProperties;
  return (
    <html lang="en" data-scroll-behavior="smooth" style={themeStyle} className={`${displayFont.variable} ${uiFont.variable} ${monoFont.variable}`}>
      <body>
        <a className="skipLink" href="#main-content">Skip to main content</a>
        <Providers>
          <SiteHeader />
          <ProtocolBanner />
          <TransactionToast />
          <RenewalReminderCenter />
          <main id="main-content" tabIndex={-1}>{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
