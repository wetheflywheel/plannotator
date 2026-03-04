import { storage } from './storage';

const STORAGE_KEY = 'plannotator-whats-new-v011-seen';

export function needsWhatsNewDialog(): boolean {
  return storage.getItem(STORAGE_KEY) !== 'true';
}

export function markWhatsNewSeen(): void {
  storage.setItem(STORAGE_KEY, 'true');
}
