'use client'

import { App, ConfigProvider, theme } from 'antd'

import type { Session } from '@/auth'
import FirebaseSessionBridge from '@/components/providers/FirebaseSessionBridge'
import NotificationPollProvider from '@/components/providers/NotificationPollProvider'
import QueryProvider from '@/components/providers/QueryProvider'
import SessionAccessGuard from '@/components/providers/SessionAccessGuard'
import { ThemeProvider, useTheme } from '@/components/providers/ThemeProvider'
import { SessionProvider } from '@/lib/auth-client'

/** Brand palette (teal + slate). CSS counterparts live in app/globals.css (--brand-*). */
export const BRAND = {
  primary: '#0F9D8A',
  primaryDark: '#0B7A6B',
  accent: '#F59E0B',
  sidebar: '#0F172A',
  lightBg: '#F6F8FA',
  darkBg: '#0B1220',
} as const

function ThemedConfig({ children }: { children: React.ReactNode }) {
  const { resolved } = useTheme()
  const isDark = resolved === 'dark'

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: BRAND.primary,
          colorInfo: BRAND.primary,
          colorLink: BRAND.primary,
          colorWarning: BRAND.accent,
          colorSuccess: '#16A34A',
          colorError: '#DC2626',
          borderRadius: 10,
          borderRadiusLG: 12,
          fontFamily: 'var(--font-sans), system-ui, -apple-system, "Segoe UI", sans-serif',
          ...(isDark
            ? {
                colorBgLayout: BRAND.darkBg,
                colorBgContainer: '#111A2E',
                colorBgElevated: '#16213A',
                colorBorder: '#26324A',
                colorBorderSecondary: '#1E293B',
              }
            : {
                colorBgLayout: BRAND.lightBg,
                colorBorderSecondary: '#E7ECF2',
                colorTextBase: '#0F172A',
              }),
        },
        /** Sidebar always uses `theme="dark"` menu (slate background, teal selection). */
        components: {
          Layout: { siderBg: BRAND.sidebar, bodyBg: isDark ? BRAND.darkBg : BRAND.lightBg },
          Menu: {
            darkItemBg: BRAND.sidebar,
            darkSubMenuItemBg: BRAND.sidebar,
            darkPopupBg: BRAND.sidebar,
            darkItemColor: 'rgba(226, 232, 240, 0.72)',
            darkItemHoverColor: '#FFFFFF',
            darkItemHoverBg: 'rgba(148, 163, 184, 0.12)',
            darkItemSelectedBg: 'rgba(15, 157, 138, 0.18)',
            darkItemSelectedColor: '#5EEAD4',
            itemBorderRadius: 8,
            itemMarginInline: 10,
          },
          Card: { boxShadowTertiary: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px rgba(15, 23, 42, 0.04)' },
          Table: isDark
            ? {
                headerBg: '#0F1729',
                headerColor: 'rgba(226, 232, 240, 0.9)',
                borderColor: '#1E293B',
                headerSplitColor: 'rgba(255, 255, 255, 0.12)',
                rowHoverBg: 'rgba(255, 255, 255, 0.04)',
                headerBorderRadius: 8,
              }
            : {
                headerBg: '#F8FAFC',
                headerColor: '#334155',
                borderColor: '#EEF2F6',
                headerSplitColor: '#EEF2F6',
                rowHoverBg: '#F0FBF9',
                headerBorderRadius: 8,
              },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  )
}

export default function AntdProvider({
  children,
  session,
}: {
  children: React.ReactNode
  session?: Session | null
}) {
  return (
    <ThemeProvider>
      <ThemedConfig>
        {/* No focus refetch — avoids heavy /api/auth/session traffic. */}
        <SessionProvider session={session} refetchOnWindowFocus={false}>
          <QueryProvider>
            <NotificationPollProvider>
              <SessionAccessGuard />
              <FirebaseSessionBridge />
              {children}
            </NotificationPollProvider>
          </QueryProvider>
        </SessionProvider>
      </ThemedConfig>
    </ThemeProvider>
  )
}
