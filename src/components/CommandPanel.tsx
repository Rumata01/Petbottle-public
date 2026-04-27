import React, { useState, useRef, useEffect, memo, useCallback } from "react";
import { BlockTypeOption } from "../types";
import { BLOCK_TYPES } from "../constants/blocks";

interface CommandPanelProps {
  isOpen: boolean;
  position: { top: number; left: number };
  onSelect: (option: BlockTypeOption) => void;
  onClose: () => void;
}

export const CommandPanel = memo(({ isOpen, position, onSelect, onClose }: CommandPanelProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchText, setSearchText] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Filtreleme - useMemo ile optimize
  const filteredTypes = React.useMemo(() =>
    BLOCK_TYPES.filter(item =>
      item.label.toLowerCase().includes(searchText.toLowerCase())
    ),
    [searchText]
  );

  // Seçili öğeyi görünür yap (scroll into view)
  const scrollSelectedIntoView = useCallback((index: number) => {
    const element = itemRefs.current[index];
    if (element && listRef.current) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });
    }
  }, []);

  // Klavye navigasyonu - optimize edildi
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex(prev => {
            const newIndex = (prev + 1) % filteredTypes.length;
            // Sonraki tick'te scroll
            requestAnimationFrame(() => scrollSelectedIntoView(newIndex));
            return newIndex;
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(prev => {
            const newIndex = (prev - 1 + filteredTypes.length) % filteredTypes.length;
            requestAnimationFrame(() => scrollSelectedIntoView(newIndex));
            return newIndex;
          });
          break;
        case "Enter":
          e.preventDefault();
          if (filteredTypes[selectedIndex]) {
            onSelect(filteredTypes[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, filteredTypes, onSelect, onClose, scrollSelectedIntoView]);

  // Index ve searchText sıfırla
  useEffect(() => {
    setSelectedIndex(0);
    // Refs dizisini sıfırla
    itemRefs.current = [];
  }, [searchText]);

  // Panel açıldığında sıfırla
  useEffect(() => {
    if (isOpen) {
      setSearchText("");
      setSelectedIndex(0);
      itemRefs.current = [];
    }
  }, [isOpen]);

  // Panel dışı tıklama
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Viewport sinir kontrolu (clamping)
  const PANEL_WIDTH = 420;
  const PANEL_MAX_HEIGHT = 450;
  const MARGIN = 8;

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  // Yatay clamp: panelin saga tasmamasi icin
  let clampedLeft = position.left;
  if (clampedLeft + PANEL_WIDTH + MARGIN > viewportW) {
    clampedLeft = viewportW - PANEL_WIDTH - MARGIN;
  }
  if (clampedLeft < MARGIN) {
    clampedLeft = MARGIN;
  }

  // Dikey clamp: asagida yer yoksa yukari ac
  let clampedTop = position.top;
  const spaceBelow = viewportH - position.top;
  const spaceAbove = position.top;

  if (spaceBelow < PANEL_MAX_HEIGHT + MARGIN && spaceAbove > spaceBelow) {
    // Yukarida daha fazla yer var — paneli yukariya dogru ac
    clampedTop = Math.max(MARGIN, position.top - PANEL_MAX_HEIGHT);
  } else {
    // Asagida ac ama viewport disina cikmasin
    clampedTop = Math.min(position.top, viewportH - PANEL_MAX_HEIGHT - MARGIN);
    if (clampedTop < MARGIN) {
      clampedTop = MARGIN;
    }
  }

  return (
    <>
      <div className="command-backdrop" onClick={onClose} />
      <div
        ref={panelRef}
        className="command-panel"
        style={{
          position: "fixed",
          top: clampedTop,
          left: clampedLeft,
        }}
      >
        <div className="command-search-container">
          <input
            type="text"
            className="command-search"
            placeholder="Blok türü ara..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            autoFocus
          />
        </div>
        <div className="command-list" ref={listRef}>
          {filteredTypes.map((item, index) => (
            <div
              key={item.type + (item.depth || "")}
              ref={(el) => { itemRefs.current[index] = el; }}
              className={`command-item ${selectedIndex === index ? "selected" : ""}`}
              onClick={() => onSelect(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="command-icon">{item.icon}</div>
              <div className="command-details">
                <div className="command-title">{item.label}</div>
                {item.description && (
                  <div className="command-description">{item.description}</div>
                )}
              </div>
            </div>
          ))}
          {filteredTypes.length === 0 && (
            <div className="command-item">
              <div className="command-details">
                <div className="command-description">Sonuç bulunamadı</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
});
