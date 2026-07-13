import type { ButtonGrid } from './types';

// Post'un JSON string alanlarını (buttons/reactions) güvenli şekilde çöz.
// Render içinde dağınık try/catch JSON.parse yerine tek yer.

export function parseButtons(raw: string | null | undefined): ButtonGrid {
  if (!raw) return [];
  try {
    const grid = JSON.parse(raw);
    return Array.isArray(grid) ? grid : [];
  } catch {
    return [];
  }
}

export function parseReactions(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

export function reactionsTotal(reactions: Record<string, number>): number {
  return Object.values(reactions).reduce((a, b) => a + b, 0);
}
