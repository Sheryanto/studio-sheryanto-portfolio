import type { WidgetSnapshot } from '../domain/types';

/**
 * Seam for the native Android shell (Milestone 3: Capacitor + AppWidgetProvider).
 *
 * In the browser/PWA build there is no native layer: `isNative` is false and publishing the widget
 * snapshot is a no-op. The snapshot is still computed and stored in IndexedDB so M3 only needs to
 * forward it to native shared storage (e.g. SharedPreferences) and trigger a widget refresh.
 * Nothing in the PWA should present itself as a home-screen widget.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

export const isNative = (): boolean =>
  Boolean((globalThis as { Capacitor?: CapacitorGlobal }).Capacitor?.isNativePlatform?.());

export async function publishWidgetSnapshot(_snapshot: WidgetSnapshot): Promise<void> {
  if (!isNative()) return;
  // M3: call the native widget bridge plugin here.
}
