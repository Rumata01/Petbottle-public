import { useState, useEffect, useRef } from "react";

export type ThemeName = "light" | "dark" | "forest" | "ocean" | "sunset";

export interface ThemeOption {
  name: ThemeName;
  label: string;
  icon: string;
}

export const THEMES: ThemeOption[] = [
  { name: "light", label: "Light", icon: "☀️" },
  { name: "dark", label: "Dark", icon: "🌙" },
  { name: "forest", label: "Forest", icon: "🌲" },
  { name: "ocean", label: "Ocean", icon: "🌊" },
  { name: "sunset", label: "Sunset", icon: "🌅" },
];

interface ThemeSwitcherProps {
  currentTheme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
}

export const ThemeSwitcher = ({ currentTheme, onThemeChange }: ThemeSwitcherProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const currentThemeData = THEMES.find((t) => t.name === currentTheme);

  return (
    <div ref={menuRef} className={`theme-switcher ${isOpen ? "open" : ""}`}>
      <button
        className="theme-switcher-toggle"
        onClick={() => setIsOpen(!isOpen)}
        title="Tema değiştir"
      >
        {currentThemeData?.icon || "🎨"}
      </button>

      <div className="theme-switcher-menu">
        {THEMES.map((theme) => (
          <div
            key={theme.name}
            className={`theme-option ${currentTheme === theme.name ? "active" : ""}`}
            onClick={() => {
              onThemeChange(theme.name);
              setIsOpen(false);
            }}
          >
            <div className={`theme-option-preview theme-option-preview--${theme.name}`}>
              {theme.icon}
            </div>
            <span className="theme-option-label">{theme.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
