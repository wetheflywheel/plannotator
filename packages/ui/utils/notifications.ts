/**
 * Browser Notification API wrapper for Plannotator.
 *
 * Requests permission once on first use, then fires native desktop
 * notifications at key auto-review milestones so the user can tab away
 * and still know what's happening.
 */

let permissionState: NotificationPermission | 'unsupported' = 'default';

function init() {
  if (typeof Notification === 'undefined') {
    permissionState = 'unsupported';
    return;
  }
  permissionState = Notification.permission;
}

init();

/** Request notification permission (idempotent, resolves immediately if already granted). */
export async function requestNotificationPermission(): Promise<boolean> {
  if (permissionState === 'unsupported') return false;
  if (permissionState === 'granted') return true;
  if (permissionState === 'denied') return false;

  try {
    permissionState = await Notification.requestPermission();
  } catch {
    permissionState = 'denied';
  }
  return permissionState === 'granted';
}

/**
 * Show a browser notification if permission is granted and the page is
 * not currently focused (no point notifying when the user is already looking).
 */
export function notify(title: string, body?: string) {
  if (permissionState !== 'granted') return;
  if (document.hasFocus()) return;

  try {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'plannotator', // collapse duplicate notifications
    });
  } catch {
    // Safari / restricted contexts may throw
  }
}
