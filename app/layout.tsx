import "./globals.css?v=1.0.1";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";

import { auth } from "@/auth";
import AntdProvider from "@/components/providers/AntdProvider";
import { getAppSettings } from "@/lib/app-settings";

const themeInitScript = `
(function(){
  try {
    var k = 'deskteam-theme';
    var s = localStorage.getItem(k) || 'system';
    var dark = s === 'dark' || (s !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();`;

const fontSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = 'https://ticket.deskteam360.com'
const OG_TITLE = 'Deskteam360 Ticketing System'
const OG_DESCRIPTION = 'Deskteam360 Ticketing System'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getAppSettings()
  const appName = settings.app_name || process.env.NEXT_PUBLIC_APP_NAME || 'Deskteam360'
  const logoUrl = settings.app_logo_url || '/logo.jpg'
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: OG_TITLE, template: `%s | ${appName}` },
    description: OG_DESCRIPTION,
    manifest: '/manifest.json',
    icons: settings.app_favicon_url ? [{ url: settings.app_favicon_url }] : undefined,
    openGraph: {
      title: OG_TITLE,
      description: OG_DESCRIPTION,
      url: SITE_URL,
      siteName: appName,
      images: [{ url: logoUrl, alt: OG_TITLE }],
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: OG_TITLE,
      description: OG_DESCRIPTION,
      images: [logoUrl],
    },
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth()
  return (
    // Browser extensions (Grammarly, password managers) mutate the DOM before hydrate; suppress root warnings.
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${fontSans.variable} antialiased`}>
        <Script id="deskteam-theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <AntdRegistry>
          <AntdProvider session={session}>
            {children}
          </AntdProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
