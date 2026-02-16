// ============================================================================
// PetBottle - React Frontend (Thema Library Entegrasyonu)
// ============================================================================
// 
// Bu dosya sadece UI katmanini icerir. Tum agir islemler Rust backend'de:
// - Markdown parsing (Rust: parse_markdown)
// - Markdown serialization (Rust: serialize_blocks)
// - Block CRUD islemleri (Rust: update_block, add_block, delete_block)
// - Undo/Redo (Rust: undo, redo)
// - State yonetimi (Rust: DocumentManager)
//
// Thema Library: Tum CSS stilleri src/styles/thema/ altinda
// ============================================================================

import React, { useState, useRef, useEffect, memo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import DOMPurify from "dompurify";

// ----------------------------------------------------------------------------
// CSS IMPORTS - Thema Library
// ----------------------------------------------------------------------------
import "./styles/thema.min.css";
import { SetupScreen } from "./SetupScreen";

// ----------------------------------------------------------------------------
// DND-KIT - Drag & Drop
// ----------------------------------------------------------------------------
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";

import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

// ============================================================================
// TYPES - Rust Block yapisiyla uyumlu
// ============================================================================

interface Block {
  id: string;
  type: string;       // Rust: BlockType enum (kebab-case)
  content: string;
  depth?: number;     // Heading seviyesi (1-6)
  infoString?: string; // Kod bloğu için dil (örn: "rust", "javascript")
  children?: Block[]; // Nested bloklar
  isCollapsed?: boolean;
}

// Command Panel icin blok turleri
interface BlockTypeOption {
  type: string;
  label: string;
  icon: string;
  depth?: number;
  description?: string;
}

// Tema turleri
type ThemeName = "light" | "dark" | "forest" | "ocean" | "sunset";

interface ThemeOption {
  name: ThemeName;
  label: string;
  icon: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BLOCK_TYPES: BlockTypeOption[] = [
  // Temel
  { type: "paragraph", label: "Paragraf", icon: "¶", description: "Düz metin" },
  { type: "heading", label: "Başlık 1", icon: "H1", depth: 1, description: "Büyük başlık" },
  { type: "heading", label: "Başlık 2", icon: "H2", depth: 2, description: "Orta başlık" },
  { type: "heading", label: "Başlık 3", icon: "H3", depth: 3, description: "Küçük başlık" },
  // Listeler
  { type: "bullet-list", label: "Liste", icon: "•", description: "Madde işaretli liste" },
  { type: "numbered-list", label: "Numaralı Liste", icon: "1.", description: "Sıralı liste" },
  { type: "checkbox", label: "Yapılacak", icon: "☐", description: "Kontrol listesi" },
  // Icerik
  { type: "quote", label: "Alıntı", icon: "❝", description: "Alıntı bloğu" },
  { type: "code", label: "Kod Bloğu", icon: "</>", description: "Kod parçacığı" },
  { type: "divider", label: "Ayraç", icon: "—", description: "Yatay çizgi" },
  // Ozel
  { type: "callout", label: "Bilgi Kutusu", icon: "💡", description: "Vurgulu bilgi" },
  { type: "toggle", label: "Açılır Blok", icon: "▶", description: "Genişletilebilir içerik" },
];

const THEMES: ThemeOption[] = [
  { name: "light", label: "Light", icon: "☀️" },
  { name: "dark", label: "Dark", icon: "🌙" },
  { name: "forest", label: "Forest", icon: "🌲" },
  { name: "ocean", label: "Ocean", icon: "🌊" },
  { name: "sunset", label: "Sunset", icon: "🌅" },
];

// ============================================================================
// THEME SWITCHER COMPONENT
// ============================================================================

interface ThemeSwitcherProps {
  currentTheme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
}

const ThemeSwitcher = ({ currentTheme, onThemeChange }: ThemeSwitcherProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dışarı tıklama
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

  const currentThemeData = THEMES.find(t => t.name === currentTheme);

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

// ============================================================================
// COMMAND PANEL COMPONENT - Thema class'lari ile
// ============================================================================

interface CommandPanelProps {
  isOpen: boolean;
  position: { top: number; left: number };
  onSelect: (option: BlockTypeOption) => void;
  onClose: () => void;
}

const CommandPanel = memo(({ isOpen, position, onSelect, onClose }: CommandPanelProps) => {
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

  return (
    <>
      <div className="command-backdrop" onClick={onClose} />
      <div
        ref={panelRef}
        className="command-panel"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
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

// ============================================================================
// BLOCK CONTENT COMPONENT - Thema class'lari ile
// ============================================================================

const BlockContentInner = ({
  block,
  onUpdate,
  onAddNext,
  onRemove,
  isFocused,
  onFocusPrev,
  onFocusNext,
  shouldMoveCursorToEnd,
  onShowCommandPanel,
  onToggleCollapse,
  listIndex,
}: {
  block: Block;
  onUpdate: (id: string, val: string) => void;
  onAddNext: (exitToParent?: boolean, blockType?: string) => void;
  onRemove: () => void;
  isFocused: boolean;
  onFocusPrev: () => void;
  onFocusNext: () => void;
  shouldMoveCursorToEnd?: boolean;
  onShowCommandPanel?: (position: { top: number; left: number }) => void;
  onToggleCollapse?: () => void;
  listIndex?: number;
}) => {
  const contentRef = React.useRef<HTMLElement>(null);
  const isHandlingSpecialKey = useRef(false);

  // Input handler
  const handleInput = (e: React.FormEvent<HTMLElement>) => {
    if (isHandlingSpecialKey.current) {
      isHandlingSpecialKey.current = false;
      return;
    }

    const newText = e.currentTarget.innerText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    onUpdate(block.id, newText);
  };

  // Focus yonetimi
  useEffect(() => {
    if (isFocused && contentRef.current) {
      contentRef.current.focus();
      if (shouldMoveCursorToEnd) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(contentRef.current);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [isFocused, shouldMoveCursorToEnd]);

  // Klavye olaylari
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // "/" tusu - Command Panel ac
    if (e.key === "/" && contentRef.current) {
      const text = contentRef.current.innerText;
      if (text === "" || text === "\n") {
        e.preventDefault();
        isHandlingSpecialKey.current = true;

        const rect = contentRef.current.getBoundingClientRect();
        if (onShowCommandPanel) {
          onShowCommandPanel({ top: rect.bottom + 5, left: rect.left });
        }
        return;
      }
    }

    // Enter - Yeni blok ekle
    if (e.key === "Enter") {
      if (e.shiftKey) return;
      e.preventDefault();
      isHandlingSpecialKey.current = true;

      const currentText = (contentRef.current?.innerText || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      if (contentRef.current) {
        onUpdate(block.id, currentText);
      }

      const isEmpty = currentText.trim() === "";
      // Liste bloklarinda Enter -> ayni turde devam et (bos ise paragraf'a don)
      const listTypes = ["bullet-list", "numbered-list", "checkbox"];
      if (listTypes.includes(block.type) && !isEmpty) {
        onAddNext(false, block.type);
      } else {
        onAddNext(isEmpty);
      }
      return;
    }

    // Backspace - Bos blokta silme
    if (e.key === "Backspace") {
      const text = (e.target as HTMLElement).innerText;

      if (text.trim() === "") {
        e.preventDefault();
        isHandlingSpecialKey.current = true;
        onRemove();
        return;
      }
    }

    // Yon tuslari
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const sel = window.getSelection();
      if (!sel?.rangeCount || !contentRef.current) return;

      const range = sel.getRangeAt(0);
      let rect = range.getBoundingClientRect();
      const containerRect = contentRef.current.getBoundingClientRect();

      if (rect.height === 0) {
        const span = document.createElement("span");
        span.textContent = "|";
        range.insertNode(span);
        rect = span.getBoundingClientRect();
        span.parentNode?.removeChild(span);
      }

      if (e.key === "ArrowUp") {
        if (rect.top - containerRect.top < 12) {
          e.preventDefault();
          isHandlingSpecialKey.current = true;

          if (contentRef.current) {
            const currentText = contentRef.current.innerText;
            onUpdate(block.id, currentText);
          }

          onFocusPrev();
        }
      }

      if (e.key === "ArrowDown") {
        if (containerRect.bottom - rect.bottom < 12) {
          e.preventDefault();
          isHandlingSpecialKey.current = true;

          if (contentRef.current) {
            const currentText = contentRef.current.innerText;
            onUpdate(block.id, currentText);
          }

          onFocusNext();
        }
      }
    }
  };

  // Blok turune gore class ve icerik
  const getBlockClass = () => {
    switch (block.type) {
      case "heading":
        return `h${block.depth || 1}`;
      case "paragraph":
        return "paragraph";
      case "bullet-list":
        return "bullet-list";
      case "numbered-list":
        return "numbered-list";
      case "checkbox":
        return "checklist-text";
      case "quote":
        return "blockquote";
      case "code":
        return "code-block";
      case "callout":
        return "callout-content";
      default:
        return "paragraph";
    }
  };

  // Blok turune gore render
  const renderBlockContent = () => {
    const contentElement = (
      <div
        ref={contentRef as React.RefObject<HTMLDivElement>}
        className={`block-content ${getBlockClass()}`}
        contentEditable
        suppressContentEditableWarning={true}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(block.content, {
            ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "br", "code"],
            ALLOWED_ATTR: ["href", "target", "rel"],
            ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i, // Sadece http, https, mailto
            FORBID_ATTR: ["onclick", "onerror", "onload"], // Event handler'ları engelle
          }),
        }}
      />
    );

    switch (block.type) {
      case "bullet-list":
        return (
          <div className="block block--bullet-list">
            <span className="block-prefix">•</span>
            {contentElement}
          </div>
        );

      case "numbered-list":
        return (
          <div className="block block--numbered-list">
            <span className="block-prefix">{(listIndex ?? 0) + 1}.</span>
            {contentElement}
          </div>
        );

      case "checkbox":
        return (
          <div className="checklist-item">
            <input type="checkbox" className="checklist-checkbox" />
            {contentElement}
          </div>
        );

      case "quote":
        return (
          <blockquote className="blockquote">
            {contentElement}
          </blockquote>
        );

      case "code":
        return (
          <div className="code-block">
            {block.infoString && (
              <div className="code-block-header">
                <span className="code-block-language">{block.infoString}</span>
              </div>
            )}
            {contentElement}
          </div>
        );

      case "callout":
        return (
          <div className="callout">
            <span className="callout-icon">💡</span>
            {contentElement}
          </div>
        );

      case "toggle":
        return (
          <div className={`toggle ${block.isCollapsed ? "" : "open"}`}>
            <div className="toggle-header">
              <span className="toggle-icon" onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onToggleCollapse?.();
              }}>▶</span>
              {contentElement}
            </div>
          </div>
        );

      case "divider":
        return (
          <div className="block block--divider" onClick={(e) => {
            e.preventDefault();
            onAddNext(false, "paragraph");
          }}>
            <hr />
          </div>
        );

      default:
        return contentElement;
    }
  };

  return renderBlockContent();
};

// Memoization
const BlockContent = memo(BlockContentInner, (prev, next) => {
  if (prev.block.id !== next.block.id) return false;
  if (prev.isFocused !== next.isFocused) return false;
  if (prev.shouldMoveCursorToEnd !== next.shouldMoveCursorToEnd) return false;
  if (prev.listIndex !== next.listIndex) return false;
  if (prev.isFocused && next.isFocused) return true;
  if (next.isFocused) return true;
  return prev.block.content === next.block.content;
});

// ============================================================================
// SORTABLE BLOCK COMPONENT - Thema class'lari ile
// ============================================================================

const SortableBlock = ({
  block,
  onUpdate,
  onAddNext,
  onRemove,
  isFocused,
  onFocusPrev,
  onFocusNext,
  shouldMoveCursorToEnd,
  onMouseDown,
  onShowCommandPanel,
  onToggleCollapse,
  listIndex,
}: {
  block: Block;
  index: number;
  onUpdate: (id: string, val: string) => void;
  onAddNext: (exitToParent?: boolean, blockType?: string) => void;
  onRemove: () => void;
  isFocused: boolean;
  onFocusPrev: () => void;
  onFocusNext: () => void;
  shouldMoveCursorToEnd?: boolean;
  onMouseDown?: () => void;
  onShowCommandPanel?: (position: { top: number; left: number }) => void;
  onToggleCollapse?: () => void;
  listIndex?: number;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`block ${isFocused ? "focused" : ""} ${isDragging ? "dragging" : ""}`}
      onMouseDown={onMouseDown}
    >
      {/* Drag handle */}
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="drag-handle"
        contentEditable={false}
      >
        ⠿
      </div>

      {/* Block content */}
      <BlockContent
        block={block}
        onUpdate={onUpdate}
        onAddNext={onAddNext}
        onRemove={onRemove}
        isFocused={isFocused}
        onFocusPrev={onFocusPrev}
        onFocusNext={onFocusNext}
        shouldMoveCursorToEnd={shouldMoveCursorToEnd}
        onShowCommandPanel={onShowCommandPanel}
        onToggleCollapse={onToggleCollapse}
        listIndex={listIndex}
      />
    </div>
  );
};

// ============================================================================
// NESTED SORTABLE BLOCK
// ============================================================================

interface NestedBlockProps {
  block: Block;
  index: number;
  depth?: number;
  focusedBlockId: string | null;
  shouldMoveCursorToEnd?: boolean;
  onBlockMouseDown: (id: string) => void;
  onAddBlock: (id: string, exitToParent?: boolean, blockType?: string) => void;
  onDeleteBlock: (id: string) => void;
  onFocusBlock: (id: string, direction: "prev" | "next") => void;
  updateBlockContent: (id: string, val: string) => void;
  onShowCommandPanel?: (blockId: string, position: { top: number; left: number }) => void;
  onToggleCollapse?: (blockId: string) => void;
  siblings?: Block[];
}

const NestedSortableBlock = ({
  block,
  index,
  depth = 0,
  focusedBlockId,
  shouldMoveCursorToEnd,
  onBlockMouseDown,
  onAddBlock,
  onDeleteBlock,
  onFocusBlock,
  updateBlockContent,
  onShowCommandPanel,
  onToggleCollapse,
  siblings,
}: NestedBlockProps) => {
  const hasChildren = block.children && block.children.length > 0;
  const nestedClass = depth > 0 ? `block--nested${depth > 1 ? `-${depth}` : ""}` : "";

  // Numarali liste icin sirali index hesapla
  const computeListIndex = (): number | undefined => {
    if (block.type !== "numbered-list" || !siblings) return undefined;
    let count = 0;
    for (let i = 0; i < index; i++) {
      if (siblings[i].type === "numbered-list") {
        count++;
      } else {
        count = 0; // Farkli tur araya girerse sifirla
      }
    }
    return count;
  };

  return (
    <div className={nestedClass}>
      <SortableBlock
        block={block}
        index={index}
        onUpdate={updateBlockContent}
        onAddNext={(exitToParent, blockType) => onAddBlock(block.id, exitToParent, blockType)}
        onRemove={() => onDeleteBlock(block.id)}
        isFocused={focusedBlockId === block.id}
        onFocusPrev={() => onFocusBlock(block.id, "prev")}
        onFocusNext={() => onFocusBlock(block.id, "next")}
        shouldMoveCursorToEnd={shouldMoveCursorToEnd}
        onMouseDown={() => onBlockMouseDown(block.id)}
        onShowCommandPanel={onShowCommandPanel ? (pos) => onShowCommandPanel(block.id, pos) : undefined}
        onToggleCollapse={onToggleCollapse ? () => onToggleCollapse(block.id) : undefined}
        listIndex={computeListIndex()}
      />

      {/* Nested children */}
      {hasChildren && (
        <SortableContext
          items={block.children!.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {block.children!.map((child, childIndex) => (
            <NestedSortableBlock
              key={child.id}
              block={child}
              index={childIndex}
              depth={depth + 1}
              focusedBlockId={focusedBlockId}
              shouldMoveCursorToEnd={shouldMoveCursorToEnd}
              onBlockMouseDown={onBlockMouseDown}
              onAddBlock={onAddBlock}
              onDeleteBlock={onDeleteBlock}
              onFocusBlock={onFocusBlock}
              updateBlockContent={updateBlockContent}
              onShowCommandPanel={onShowCommandPanel}
              onToggleCollapse={onToggleCollapse}
              siblings={block.children!}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
};

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

function App() {
  // ----------------------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------------------
  const [path, setPath] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>("");

  // Document state
  const [docId, setDocId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);

  // UI state
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [shouldMoveCursorToEnd, setShouldMoveCursorToEnd] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Setup State
  const [isSetupComplete, setIsSetupComplete] = useState(() => {
    return localStorage.getItem("petbottle_setup_complete") === "true";
  });

  // Tema state - güvenli okuma
  const [theme, setTheme] = useState<ThemeName>(() => {
    const savedTheme = localStorage.getItem("theme");
    const validThemes: ThemeName[] = ["light", "dark", "forest", "ocean", "sunset"];
    return validThemes.includes(savedTheme as ThemeName) ? (savedTheme as ThemeName) : "light";
  });

  // Command Panel state
  const [commandPanelOpen, setCommandPanelOpen] = useState(false);
  const [commandPanelPosition, setCommandPanelPosition] = useState({ top: 0, left: 0 });
  const [commandPanelBlockId, setCommandPanelBlockId] = useState<string | null>(null);

  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "error" | "info">("success");

  // Yeni dosya girisi icin state
  const [newFileName, setNewFileName] = useState("");
  const [showNewFileInput, setShowNewFileInput] = useState(false);

  // Drag & Drop sensor
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  // ----------------------------------------------------------------------------
  // TEMA YONETIMI
  // ----------------------------------------------------------------------------

  const changeTheme = useCallback((newTheme: ThemeName) => {
    document.body.dataset.theme = newTheme;
    localStorage.setItem("theme", newTheme);
    setTheme(newTheme);
  }, []);

  // Tema uygula
  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  // ----------------------------------------------------------------------------
  // RUST BACKEND IPC CALLS
  // ----------------------------------------------------------------------------

  // Varsayilan dizini yukle (Setup kontrolu ile)
  useEffect(() => {
    async function initApp() {
      // 1. Setup durumu kontrolu
      const isSetup = localStorage.getItem("petbottle_setup_complete") === "true";
      const savedPath = localStorage.getItem("petbottle_last_directory");

      if (!isSetup || !savedPath) {
        setIsSetupComplete(false);
        return;
      }

      // 2. Kayitli yolun gecerliligini kontrol et
      try {
        const exists = await invoke<boolean>("check_path_exists", { path: savedPath });

        if (exists) {
          setPath(savedPath);
          const result = await invoke("list_files", { path: savedPath });
          setFiles(result as string[]);
          setIsSetupComplete(true);
        } else {
          // Yol gecersizse setup ekranina don
          console.warn("Kayitli yol bulunamadi, kurulum ekranina dönülüyor.");
          setIsSetupComplete(false);
          localStorage.removeItem("petbottle_setup_complete");
        }
      } catch (err) {
        console.error("Yol kontrolü hatası:", err);
        setIsSetupComplete(false);
      }
    }

    initApp();
  }, []);

  const handleSetupComplete = async (selectedPath: string) => {
    try {
      // Secilen yolu test et ve listele
      const result = await invoke("list_files", { path: selectedPath });
      setFiles(result as string[]);
      setPath(selectedPath);

      // Kaydet
      localStorage.setItem("petbottle_last_directory", selectedPath);
      localStorage.setItem("petbottle_setup_complete", "true");
      setIsSetupComplete(true);
    } catch (err) {
      console.error("Setup tamamlanamadi:", err);
      // SetupScreen icinde hata gosterimi icin buraya bir sey donulebilir
      // veya SetupScreen kendi icinde handle eder.
    }
  };

  // Dosya listele
  async function getFiles() {
    try {
      const result = await invoke("list_files", { path: path });
      setFiles(result as string[]);
      // Basarili dizin degisikligini hatirla
      localStorage.setItem("petbottle_last_directory", path);
    } catch (error) {
      console.error("Hata: ", error);
    }
  }

  // Dosya ac
  async function openFile(file: string) {
    try {
      if (docId) {
        await invoke("close_document", { docId });
      }

      setBlocks([]);
      setFocusedBlockId(null);

      const fullPath = path.endsWith("/") ? `${path}${file}` : `${path}/${file}`;

      const result = await invoke("open_document", { path: fullPath }) as [string, Block[]];
      const [newDocId, parsedBlocks] = result;

      setDocId(newDocId);
      setBlocks(parsedBlocks);
      setSelectedFile(file);

      if (parsedBlocks.length > 0) {
        setFocusedBlockId(parsedBlocks[0].id);
      }
    } catch (error) {
      console.error("Dosya acilamadi:", error);
      showToastMessage("Dosya açılamadı: " + error, "error");
    }
  }

  // Yeni dosya olustur (performansli)
  const createFile = useCallback(async (filename: string) => {
    if (!path || !filename.trim()) {
      showToastMessage("Dosya adı boş olamaz", "error");
      return;
    }

    try {
      const newFileName = await invoke<string>("create_file", {
        directory: path,
        filename: filename.trim(),
      });

      // Dosya listesini guncelle
      setFiles(prev => [...prev, newFileName].sort());
      showToastMessage(`"${newFileName}" oluşturuldu`, "success");

      // Yeni dosyayi ac
      await openFile(newFileName);
    } catch (error) {
      console.error("Dosya olusturulamadi:", error);
      showToastMessage("Dosya oluşturulamadı: " + error, "error");
    }
  }, [path]);

  // Dosya sil (performansli)
  const deleteFile = useCallback(async (filename: string) => {
    if (!path || !filename) return;

    try {
      await invoke("delete_file", {
        directory: path,
        filename: filename,
      });

      // Dosya listesinden cikar
      setFiles(prev => prev.filter(f => f !== filename));

      // Silinen dosya acik dosya ise kapat
      if (selectedFile === filename) {
        if (docId) {
          await invoke("close_document", { docId });
        }
        setDocId(null);
        setBlocks([]);
        setSelectedFile(null);
        setFocusedBlockId(null);
      }

      showToastMessage(`"${filename}" silindi`, "success");
    } catch (error) {
      console.error("Dosya silinemedi:", error);
      showToastMessage("Dosya silinemedi: " + error, "error");
    }
  }, [path, selectedFile, docId]);

  // Toast helper
  const showToastMessage = (message: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // ----------------------------------------------------------------------------
  // BLOCK CRUD - RUST BACKEND CALLS
  // ----------------------------------------------------------------------------

  const updateBlockContent = useCallback(async (id: string, newContent: string) => {
    if (!docId) return;

    setBlocks(prev => updateBlockRecursive(prev, id, newContent));

    try {
      await invoke("update_block", { docId, blockId: id, content: newContent });
    } catch (error) {
      console.error("Blok guncellenemedi:", error);
    }
  }, [docId]);

  const updateBlockRecursive = (blocks: Block[], id: string, content: string): Block[] => {
    return blocks.map(block => {
      if (block.id === id) {
        return { ...block, content };
      }
      if (block.children && block.children.length > 0) {
        return { ...block, children: updateBlockRecursive(block.children, id, content) };
      }
      return block;
    });
  };

  const addBlock = useCallback(async (currentId: string, exitToParent: boolean = false, blockType?: string) => {
    if (!docId) return;

    setShouldMoveCursorToEnd(true);

    try {
      const newBlock = await invoke("add_block", {
        docId,
        afterId: currentId,
        exitToParent,
        blockType: blockType || null
      }) as Block;

      const updatedBlocks = await invoke("get_blocks", { docId }) as Block[];
      setBlocks(updatedBlocks);
      setFocusedBlockId(newBlock.id);
    } catch (error) {
      console.error("Blok eklenemedi:", error);
    }
  }, [docId]);

  const toggleCollapse = useCallback(async (blockId: string) => {
    if (!docId) return;

    try {
      await invoke("toggle_collapse", { docId, blockId });
      const updatedBlocks = await invoke("get_blocks", { docId }) as Block[];
      setBlocks(updatedBlocks);
    } catch (error) {
      console.error("Toggle durumu degistirilemedi:", error);
    }
  }, [docId]);

  const deleteBlock = useCallback(async (blockId: string) => {
    if (!docId) return;

    try {
      const prevBlockId = await invoke("delete_block", { docId, blockId }) as string | null;

      const updatedBlocks = await invoke("get_blocks", { docId }) as Block[];
      setBlocks(updatedBlocks);

      if (prevBlockId) {
        setFocusedBlockId(prevBlockId);
        setShouldMoveCursorToEnd(true);
      }
    } catch (error) {
      console.error("Blok silinemedi:", error);
    }
  }, [docId]);

  const changeBlockType = useCallback(async (blockId: string, newType: string, depth?: number) => {
    if (!docId) return;

    try {
      await invoke("change_block_type", { docId, blockId, newType, depth });

      const updatedBlocks = await invoke("get_blocks", { docId }) as Block[];
      setBlocks(updatedBlocks);
    } catch (error) {
      console.error("Blok turu degistirilemedi:", error);
    }
  }, [docId]);

  // ----------------------------------------------------------------------------
  // UNDO / REDO
  // ----------------------------------------------------------------------------

  const undo = useCallback(async () => {
    if (!docId) return;

    try {
      const result = await invoke("undo", { docId }) as Block[] | null;
      if (result) {
        setBlocks(result);
        showToastMessage("Geri alındı", "info");
      }
    } catch (error) {
      console.error("Undo hatasi:", error);
    }
  }, [docId]);

  const redo = useCallback(async () => {
    if (!docId) return;

    try {
      const result = await invoke("redo", { docId }) as Block[] | null;
      if (result) {
        setBlocks(result);
        showToastMessage("Yinelendi", "info");
      }
    } catch (error) {
      console.error("Redo hatasi:", error);
    }
  }, [docId]);

  // ----------------------------------------------------------------------------
  // SAVE
  // ----------------------------------------------------------------------------

  const saveFile = useCallback(async () => {
    if (!docId) return;

    try {
      await invoke("save_document", { docId });
      showToastMessage("Kaydedildi ✓", "success");
    } catch (error) {
      console.error("Kayit hatasi:", error);
      showToastMessage("Kayıt başarısız!", "error");
    }
  }, [docId]);

  // ----------------------------------------------------------------------------
  // KEYBOARD SHORTCUTS
  // ----------------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveFile();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveFile, undo, redo]);

  // ----------------------------------------------------------------------------
  // FOCUS NAVIGATION
  // ----------------------------------------------------------------------------

  const flattenBlocks = (blocks: Block[]): Block[] => {
    const result: Block[] = [];
    const flatten = (items: Block[]) => {
      for (const block of items) {
        result.push(block);
        if (block.children) flatten(block.children);
      }
    };
    flatten(blocks);
    return result;
  };

  const focusBlock = useCallback((currentId: string, direction: "prev" | "next") => {
    const flat = flattenBlocks(blocks);
    const currentIndex = flat.findIndex(b => b.id === currentId);

    if (direction === "prev" && currentIndex > 0) {
      setShouldMoveCursorToEnd(true);
      setFocusedBlockId(flat[currentIndex - 1].id);
    } else if (direction === "next" && currentIndex < flat.length - 1) {
      setShouldMoveCursorToEnd(true);
      setFocusedBlockId(flat[currentIndex + 1].id);
    }
  }, [blocks]);

  // ----------------------------------------------------------------------------
  // DRAG & DROP
  // ----------------------------------------------------------------------------

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !docId) return;

    const isShiftPressed = (event.activatorEvent as MouseEvent)?.shiftKey || false;

    try {
      const updatedBlocks = await invoke("move_block", {
        docId,
        blockId: active.id as string,
        targetId: over.id as string,
        asChild: isShiftPressed,
      }) as Block[];

      setBlocks(updatedBlocks);
    } catch (error) {
      console.error("Blok tasinamadi:", error);
    }
  }, [docId]);

  // ============================================================================
  // RENDER - Thema class'lari ile
  // ============================================================================


  if (!isSetupComplete) {
    return <SetupScreen onComplete={handleSetupComplete} />;
  }

  return (
    <div className="app-container">

      {/* Sidebar Toggle */}
      <div className="sidebar-toggle-column">
        <button
          className="sidebar-toggle-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? "Sidebar kapat" : "Sidebar aç"}
        >
          ☰
        </button>
      </div>

      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="app-sidebar">
          {/* Header - Path ve Buton */}
          <div className="app-sidebar-header">
            <div className="search-container">
              <input
                className="search-input"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/home/kullanici/Notlarim/"
              />
            </div>
            <button className="sidebar-btn" onClick={getFiles}>
              <span className="sidebar-btn-icon">📁</span>
              Klasörü Aç
            </button>

            {/* Yeni Dosya Butonlari */}
            {files.length > 0 && (
              <div className="sidebar-file-actions">
                {showNewFileInput ? (
                  <div className="new-file-input-container">
                    <input
                      className="search-input"
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      placeholder="Dosya adı..."
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newFileName.trim()) {
                          createFile(newFileName);
                          setNewFileName("");
                          setShowNewFileInput(false);
                        } else if (e.key === "Escape") {
                          setNewFileName("");
                          setShowNewFileInput(false);
                        }
                      }}
                    />
                    <button
                      className="sidebar-btn sidebar-btn-small"
                      onClick={() => {
                        if (newFileName.trim()) {
                          createFile(newFileName);
                          setNewFileName("");
                          setShowNewFileInput(false);
                        }
                      }}
                    >
                      ✓
                    </button>
                    <button
                      className="sidebar-btn sidebar-btn-small sidebar-btn-cancel"
                      onClick={() => {
                        setNewFileName("");
                        setShowNewFileInput(false);
                      }}
                    >
                      ✗
                    </button>
                  </div>
                ) : (
                  <button
                    className="sidebar-btn sidebar-btn-secondary"
                    onClick={() => setShowNewFileInput(true)}
                  >
                    + Yeni Dosya
                  </button>
                )}
              </div>
            )}
          </div>

          {/* File list */}
          <div className="app-sidebar-content">
            {files.map((file, i) => (
              <div
                key={i}
                className={`file-card ${selectedFile === file ? "active" : ""}`}
                onClick={() => openFile(file)}
              >
                <span className="file-card-name">
                  {file.replace(/\.[^/.]+$/, "")}
                </span>
                <span className="file-card-extension">
                  {file.includes(".") ? `.${file.split(".").pop()}` : ""}
                </span>
                {/* Silme butonu */}
                <button
                  className="file-card-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`"${file}" silinsin mi?`)) {
                      deleteFile(file);
                    }
                  }}
                  title="Dosyayı sil"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </aside>
      )}
      {/* Editor Area */}
      <div
        className="editor-main"
        onDoubleClick={async (e) => {
          if (e.target === e.currentTarget && blocks.length > 0) {
            const lastBlock = blocks[blocks.length - 1];
            await addBlock(lastBlock.id);
          }
        }}
      >
        {selectedFile && blocks.length > 0 ? (
          <div className="editor-wrapper">

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={blocks.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {blocks.map((block, index) => (
                  <NestedSortableBlock
                    key={block.id}
                    block={block}
                    index={index}
                    depth={0}
                    focusedBlockId={focusedBlockId}
                    shouldMoveCursorToEnd={shouldMoveCursorToEnd}
                    onBlockMouseDown={(id) => {
                      setShouldMoveCursorToEnd(false);
                      setFocusedBlockId(id);
                    }}
                    onAddBlock={addBlock}
                    onDeleteBlock={deleteBlock}
                    onFocusBlock={focusBlock}
                    updateBlockContent={updateBlockContent}
                    onShowCommandPanel={(blockId, position) => {
                      setCommandPanelBlockId(blockId);
                      setCommandPanelPosition(position);
                      setCommandPanelOpen(true);
                    }}
                    onToggleCollapse={toggleCollapse}
                    siblings={blocks}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {/* Command Panel */}
            <CommandPanel
              isOpen={commandPanelOpen}
              position={commandPanelPosition}
              onClose={() => {
                setCommandPanelOpen(false);
                setCommandPanelBlockId(null);
              }}
              onSelect={(option) => {
                if (commandPanelBlockId) {
                  changeBlockType(commandPanelBlockId, option.type, option.depth);
                }

                const targetBlockId = commandPanelBlockId;
                setCommandPanelOpen(false);
                setCommandPanelBlockId(null);

                setFocusedBlockId(null);
                setTimeout(() => {
                  if (targetBlockId) {
                    setFocusedBlockId(targetBlockId);
                    setShouldMoveCursorToEnd(true);
                  }
                }, 100);
              }}
            />
          </div>
        ) : (
          <div className="editor-empty-state" />
        )}
      </div>

      {/* Theme Switcher */}
      <ThemeSwitcher currentTheme={theme} onThemeChange={changeTheme} />

      {/* Toast */}
      {showToast && (
        <div className={`toast toast-${toastType}`}>
          <div className="toast-icon">
            {toastType === "success" ? "✓" : toastType === "error" ? "✕" : "ℹ"}
          </div>
          <div className="toast-message">{toastMessage}</div>
        </div>
      )}
    </div>
  );
}

export default App;
