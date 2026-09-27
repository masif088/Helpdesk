import "./globals.css?v=1.0.1";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";

import { auth } from "@/auth";
import AntdProvider from "@/components/providers/AntdProvider";
import { getAppSettings } from "@/lib/app-settings";
import { BRANDING } from "@/lib/branding";

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

/** Title, description, logo and favicon come from env (lib/branding.ts); Settings → App Branding overrides. */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getAppSettings()
  const appName = settings.app_name || BRANDING.name
  const title = process.env.NEXT_PUBLIC_APP_TITLE?.trim() || appName
  const description = BRANDING.description
  const logoUrl = settings.app_logo_url || BRANDING.logo || '/og-image.png'
  const favicon = settings.app_favicon_url || BRANDING.favicon
  return {
    ...(BRANDING.siteUrl ? { metadataBase: new URL(BRANDING.siteUrl) } : {}),
    title: { default: title, template: `%s | ${appName}` },
    description,
    applicationName: appName,
    icons: { icon: [{ url: favicon }], shortcut: [{ url: favicon }] },
    openGraph: {
      title,
      description,
      ...(BRANDING.siteUrl ? { url: BRANDING.siteUrl } : {}),
      siteName: appName,
      images: [{ url: logoUrl, alt: title }],
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
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
