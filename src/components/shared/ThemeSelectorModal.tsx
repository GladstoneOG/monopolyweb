// src/components/shared/ThemeSelectorModal.tsx
import React, { useMemo, useState } from 'react';
import {
  applyMonopolyTheme,
  getAllMonopolyThemes,
  getSavedMonopolyThemeKey,
  type MonopolyThemeOption,
} from '../../utils/themeBridge';

interface ThemeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentThemeKey?: string;
  onSelectTheme?: (themeKey: string) => void;
}

export const ThemeSelectorModal: React.FC<ThemeSelectorModalProps> = ({
  isOpen,
  onClose,
  currentThemeKey,
  onSelectTheme,
}) => {
  const [selectedKey, setSelectedKey] = useState<string>(
    currentThemeKey || getSavedMonopolyThemeKey()
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'popular' | 'all' | 'dark' | 'light'>('popular');

  const allThemes = useMemo(() => getAllMonopolyThemes(), []);

  const filteredThemes = useMemo(() => {
    let list: MonopolyThemeOption[] = allThemes;
    if (filterTab === 'popular') {
      list = list.filter((t) => t.isPopular || t.id === 'monopoly_classic');
    } else if (filterTab === 'dark') {
      list = list.filter((t) => t.isDark);
    } else if (filterTab === 'light') {
      list = list.filter((t) => !t.isDark);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (t) => t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allThemes, filterTab, searchQuery]);

  if (!isOpen) return null;

  const handleSelect = (themeId: string) => {
    setSelectedKey(themeId);
    applyMonopolyTheme(themeId);
    onSelectTheme?.(themeId);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="theme-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="theme-modal-header">
          <div>
            <h2>🎨 Theme Selector</h2>
            <p>{allThemes.length} Monkeytype color schemes for tabletop &amp; HUD</p>
          </div>
          <button type="button" className="icon-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="theme-modal-toolbar">
          <input
            type="text"
            placeholder="Search themes (e.g. nord, dracula, matcha, catppuccin)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="theme-search-input"
          />
          <div className="theme-tabs">
            {(['popular', 'all', 'dark', 'light'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`theme-tab-btn ${filterTab === tab ? 'active' : ''}`}
                onClick={() => setFilterTab(tab)}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="theme-grid">
          {filteredThemes.map((t) => {
            const active = selectedKey === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className={`theme-swatch-card ${active ? 'selected' : ''}`}
                style={{
                  background: t.colors.bg,
                  color: t.colors.text,
                  borderColor: active ? t.colors.main : `${t.colors.sub}55`,
                }}
                onClick={() => handleSelect(t.id)}
              >
                <span className="theme-swatch-name">{t.name}</span>
                <span className="theme-swatch-dots">
                  <span style={{ background: t.colors.main }} />
                  <span style={{ background: t.colors.sub }} />
                  <span style={{ background: t.colors.text }} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
