// src/utils/themeBridge.ts
import {
  applyCapsaTheme,
  getAllCapsaThemes,
  getSavedCapsaThemeKey,
  MONKEYTYPE_THEMES,
  type CapsaThemeOption,
} from './themes';

const MONOPOLY_THEME_KEY = 'monopoly_web_theme';

export type MonopolyThemeOption = CapsaThemeOption;

export function getSavedMonopolyThemeKey(): string {
  try {
    return localStorage.getItem(MONOPOLY_THEME_KEY) || getSavedCapsaThemeKey() || 'monopoly_classic';
  } catch {
    return 'monopoly_classic';
  }
}

export function getAllMonopolyThemes(): MonopolyThemeOption[] {
  const list = getAllCapsaThemes();
  return list.map((t) =>
    t.id === 'capsa_classic'
      ? { ...t, id: 'monopoly_classic', name: 'Monopoly Classic (Warm Wood)' }
      : t
  );
}

export function applyMonopolyTheme(themeId: string): void {
  try {
    localStorage.setItem(MONOPOLY_THEME_KEY, themeId);
  } catch {
    // ignore
  }

  const root = document.documentElement;
  if (themeId === 'monopoly_classic' || themeId === 'capsa_classic') {
    applyCapsaTheme('capsa_classic');
    root.style.removeProperty('--tabletop-bg');
    root.style.removeProperty('--accent-primary');
    root.style.removeProperty('--accent-gold');
    root.style.removeProperty('--menu-bg');
    root.style.removeProperty('--panel-bg');
    root.style.removeProperty('--panel-border');
    root.style.removeProperty('--surface-bg');
    root.style.removeProperty('--surface-elevated');
    root.style.removeProperty('--surface-border');
    root.style.removeProperty('--input-bg');
    root.style.removeProperty('--input-border');
    root.style.removeProperty('--ui-text');
    root.style.removeProperty('--ui-muted');
    return;
  }

  applyCapsaTheme(themeId);
  const colors = MONKEYTYPE_THEMES[themeId];
  if (!colors) return;

  root.style.setProperty(
    '--tabletop-bg',
    `radial-gradient(circle at center, ${colors.subAlt} 0%, ${colors.bg} 100%)`
  );
  root.style.setProperty('--accent-primary', colors.main);
  root.style.setProperty('--accent-gold', colors.caret || colors.main);
  root.style.setProperty('--menu-bg', `radial-gradient(circle at top, ${colors.subAlt} 0%, ${colors.bg} 100%)`);
  root.style.setProperty('--panel-bg', colors.subAlt);
  root.style.setProperty('--panel-border', `${colors.main}44`);
  root.style.setProperty('--surface-bg', `${colors.bg}cc`);
  root.style.setProperty('--surface-elevated', `${colors.bg}ee`);
  root.style.setProperty('--surface-border', `${colors.main}33`);
  root.style.setProperty('--input-bg', colors.bg);
  root.style.setProperty('--input-border', `${colors.main}55`);
  root.style.setProperty('--ui-text', colors.text);
  root.style.setProperty('--ui-muted', colors.sub);
}
