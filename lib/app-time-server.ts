/** The app's time zone on the server (Settings → Time zone). Never throws: a settings hiccup gives the default zone. */
import { getAppSettings } from '@/lib/app-settings'
import { DEFAULT_TIME_ZONE } from '@/lib/app-time'

export async function getAppTimeZone(): Promise<string> {
  try {
    return (await getAppSettings()).app_timezone
  } catch {
    return DEFAULT_TIME_ZONE
  }
}
