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
import ContentEditable, { ContentEditableEvent } from "react-contenteditable";

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
  DragOverEvent,
  DragStartEvent,
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

// Tema türleri ve bileşenleri Settings modülünden
import { ThemeName, ThemeSwitcher } from "./Settings";
import { Sidebar } from "./Sidebar";
export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
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

// Theme list has been moved to Settings component

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

// ============================================================================
// BLOCK CONTENT COMPONENT - Thema class'lari ile
// ============================================================================

const BlockContentInner = ({
  block,
  onUpdate,
  onAddNext,
  onRemove,
  onDemoteBlock,
  onDecreaseDepth,
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
  onDemoteBlock?: () => void;
  onDecreaseDepth?: () => void;
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
  const handleInput = (e: ContentEditableEvent) => {
    if (isHandlingSpecialKey.current) {
      isHandlingSpecialKey.current = false;
      return;
    }

    const newHtml = e.target.value;
    onUpdate(block.id, newHtml);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const htmlText = e.clipboardData.getData("text/html");
    const plainText = e.clipboardData.getData("text/plain");
    
    let textToInsert = "";
    if (htmlText) {
       textToInsert = DOMPurify.sanitize(htmlText, {
         ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "br", "code"],
         ALLOWED_ATTR: ["href", "target", "rel"],
         ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i,
         FORBID_ATTR: ["onclick", "onerror", "onload"],
       });
    } else {
       // Escape basic plain text formatting to avoid implicit tags
       textToInsert = plainText.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    
    document.execCommand("insertHTML", false, textToInsert);
  };

  // Focus state degistiginde veya content degistiginde focus'u ayarla
  useEffect(() => {
    if (isFocused && contentRef.current) {
      contentRef.current.focus();
      // Ogeyi ortalayacak sekilde ve dumduz kaydir
      contentRef.current.scrollIntoView({ behavior: "smooth", block: "center" });

      if (shouldMoveCursorToEnd) {
        const sel = window.getSelection();
        const range = document.createRange();
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

      const currentHtml = contentRef.current?.innerHTML || "";
      if (contentRef.current) {
        onUpdate(block.id, currentHtml);
      }

      const isEmpty = currentHtml.trim() === "" || currentHtml === "<br>";
      // Liste bloklarinda Enter -> ayni turde devam et (bos ise paragraf'a don)
      const listTypes = ["bullet-list", "numbered-list", "checkbox"];
      if (listTypes.includes(block.type) && !isEmpty) {
        onAddNext(false, block.type);
      } else {
        onAddNext(isEmpty);
      }
      return;
    }

    // Backspace - Akilli silme mantigi
    if (e.key === "Backspace") {
      const text = (e.target as HTMLElement).innerText;

      if (text.trim() === "") {
        e.preventDefault();
        isHandlingSpecialKey.current = true;

        // Ozel tip kontrolu: once paragrafa donustur
        const specialTypes = ["heading", "bullet-list", "numbered-list",
          "checkbox", "quote", "code", "callout", "toggle"];
        if (specialTypes.includes(block.type)) {
          // Blogu paragrafa demote et
          if (onDemoteBlock) {
            onDemoteBlock();
          }
          return;
        }

        // 2. Depth kontrolu: depth > 0 ise once deriligi azalt
        if (block.depth && block.depth > 0 && onDecreaseDepth) {
          onDecreaseDepth();
          return;
        }

        // Paragraf tipindeyse ve depth 0 → sil ve onceki bloga gec
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
            const currentHtml = contentRef.current.innerHTML;
            onUpdate(block.id, currentHtml);
          }

          onFocusPrev();
        }
      }

      if (e.key === "ArrowDown") {
        if (containerRect.bottom - rect.bottom < 12) {
          e.preventDefault();
          isHandlingSpecialKey.current = true;

          if (contentRef.current) {
            const currentHtml = contentRef.current.innerHTML;
            onUpdate(block.id, currentHtml);
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
      <ContentEditable
        innerRef={contentRef as React.RefObject<HTMLElement>}
        className={`block-content ${getBlockClass()}`}
        html={DOMPurify.sanitize(block.content, {
          ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "br", "code"],
          ALLOWED_ATTR: ["href", "target", "rel"],
          ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i, // Sadece http, https, mailto
          FORBID_ATTR: ["onclick", "onerror", "onload"], // Event handler'ları engelle
        })}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
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
          <div className={`toggle ${block.isCollapsed === false ? "open" : ""}`}>
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
          <div
            className="block block--divider"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddNext(false, "paragraph");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAddNext(false, "paragraph");
              } else if (e.key === "Backspace" || e.key === "Delete") {
                e.preventDefault();
                onRemove();
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                onFocusPrev();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                onFocusNext();
              }
            }}
          >
            <div className="divider-text">{"────────────────────────────────────────"}</div>
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
  if (prev.onDemoteBlock !== next.onDemoteBlock) return false;
  if (prev.onDecreaseDepth !== next.onDecreaseDepth) return false;
  if (prev.isFocused && next.isFocused) return true;
  if (next.isFocused) return true;
  return prev.block.content === next.block.content;
});

// ============================================================================
// SORTABLE BLOCK COMPONENT - Thema class'lari ile
// ============================================================================

type DropPosition = "above" | "below" | "right" | "left";

interface DropIndicatorState {
  targetId: string;
  position: DropPosition;
}

const SortableBlock = ({
  block,
  onUpdate,
  onAddNext,
  onRemove,
  onDemoteBlock,
  onDecreaseDepth,
  isFocused,
  onFocusPrev,
  onFocusNext,
  shouldMoveCursorToEnd,
  onMouseDown,
  onShowCommandPanel,
  onToggleCollapse,
  listIndex,
  dropIndicator,
}: {
  block: Block;
  index: number;
  onUpdate: (id: string, val: string) => void;
  onAddNext: (exitToParent?: boolean, blockType?: string) => void;
  onRemove: () => void;
  onDemoteBlock?: () => void;
  onDecreaseDepth?: () => void;
  isFocused: boolean;
  onFocusPrev: () => void;
  onFocusNext: () => void;
  shouldMoveCursorToEnd?: boolean;
  onMouseDown?: () => void;
  onShowCommandPanel?: (position: { top: number; left: number }) => void;
  onToggleCollapse?: () => void;
  listIndex?: number;
  dropIndicator?: DropIndicatorState | null;
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

  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!contextMenuPos) return;

    const handleClickOutside = () => {
      setContextMenuPos(null);
    };

    document.addEventListener("click", handleClickOutside);
    document.addEventListener("contextmenu", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("contextmenu", handleClickOutside);
    };
  }, [contextMenuPos]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isDropTarget = dropIndicator?.targetId === block.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`block ${isFocused ? "focused" : ""} ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}`}
      onMouseDown={onMouseDown}
    >
      {/* Drop indicators */}
      {isDropTarget && dropIndicator?.position === "above" && (
        <div className="drop-indicator drop-indicator--above" />
      )}
      {isDropTarget && dropIndicator?.position === "below" && (
        <div className="drop-indicator drop-indicator--below" />
      )}
      {isDropTarget && dropIndicator?.position === "right" && (
        <div className="drop-indicator drop-indicator--right" />
      )}
      {isDropTarget && dropIndicator?.position === "left" && (
        <div className="drop-indicator drop-indicator--left" />
      )}

      {/* Drag handle */}
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="drag-handle"
        contentEditable={false}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenuPos({ x: e.clientX, y: e.clientY });
        }}
      >
        ⠿
      </div>

      {/* Context Menu for Block Deletion */}
      {contextMenuPos && (
        <div
          style={{
            position: "fixed",
            top: contextMenuPos.y,
            left: contextMenuPos.x,
            background: "var(--surface-base, #fff)",
            border: "1px solid var(--border-primary, #ccc)",
            borderRadius: "6px",
            padding: "4px",
            zIndex: 9999,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            style={{
              background: "none",
              border: "none",
              color: "#dc2626",
              padding: "6px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              borderRadius: "4px",
              width: "100%",
              fontSize: "14px",
              fontWeight: 500
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(220, 38, 38, 0.1)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
              setContextMenuPos(null);
            }}
          >
            🗑️ Bloğu Sil
          </button>
        </div>
      )}

      {/* Block content */}
      <BlockContent
        block={block}
        onUpdate={onUpdate}
        onAddNext={onAddNext}
        onRemove={onRemove}
        onDemoteBlock={onDemoteBlock}
        onDecreaseDepth={onDecreaseDepth}
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
  onDemoteBlock?: (id: string) => void;
  onDecreaseDepth?: (id: string) => void;
  onFocusBlock: (id: string, direction: "prev" | "next") => void;
  updateBlockContent: (id: string, val: string) => void;
  onShowCommandPanel?: (blockId: string, position: { top: number; left: number }) => void;
  onToggleCollapse?: (blockId: string) => void;
  siblings?: Block[];
  dropIndicator?: DropIndicatorState | null;
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
  onDemoteBlock,
  onDecreaseDepth,
  onFocusBlock,
  updateBlockContent,
  onShowCommandPanel,
  onToggleCollapse,
  siblings,
  dropIndicator,
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
        onDemoteBlock={onDemoteBlock ? () => onDemoteBlock(block.id) : undefined}
        onDecreaseDepth={onDecreaseDepth ? () => onDecreaseDepth(block.id) : undefined}
        isFocused={focusedBlockId === block.id}
        onFocusPrev={() => onFocusBlock(block.id, "prev")}
        onFocusNext={() => onFocusBlock(block.id, "next")}
        shouldMoveCursorToEnd={shouldMoveCursorToEnd}
        onMouseDown={() => onBlockMouseDown(block.id)}
        onShowCommandPanel={onShowCommandPanel ? (pos) => onShowCommandPanel(block.id, pos) : undefined}
        onToggleCollapse={onToggleCollapse ? () => onToggleCollapse(block.id) : undefined}
        listIndex={computeListIndex()}
        dropIndicator={dropIndicator}
      />

      {/* Nested children — toggle durumuna göre göster/gizle */}
      {hasChildren && (block.type !== "toggle" || !block.isCollapsed) && (
        <div className={block.type === "toggle" ? "toggle-children-wrapper" : ""}>
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
                onDemoteBlock={onDemoteBlock}
                onDecreaseDepth={onDecreaseDepth}
                onFocusBlock={onFocusBlock}
                updateBlockContent={updateBlockContent}
                onShowCommandPanel={onShowCommandPanel}
                onToggleCollapse={onToggleCollapse}
                siblings={block.children!}
                dropIndicator={dropIndicator}
              />
            ))}
          </SortableContext>
        </div>
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
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>("");

  // Document state
  const [docId, setDocId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);

  // UI state
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [shouldMoveCursorToEnd, setShouldMoveCursorToEnd] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Debounce ref for history
  const historyDebounceRef = useRef<NodeJS.Timeout | null>(null);

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
          setFiles(result as FileNode[]);
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

  const handleSetupComplete = async (selectedPath: string): Promise<void> => {
    try {
      // 1. Secilen yolu test et ve listele
      let result = await invoke("list_files", { path: selectedPath }) as FileNode[];

      // 2. Eger klasor bossa veya md dosyasi yoksa Hosgeldin.md olustur
      if (result.length === 0) {
        const welcomeContent = `# PetBottle'a Hoşgeldiniz! 👋

PetBottle, markdown tabanlı modern bir not alma uygulamasıdır. Notlarınızı bloklar halinde oluşturun, düzenleyin ve yönetin.

## Nasıl Kullanılır?

PetBottle'da her şey bloklar üzerinden çalışır. Bir bloğun içindeyken:

- **Enter** tuşuna basarak yeni blok oluşturabilirsiniz
- **/** (slash) tuşuna basarak blok türünü değiştirebilirsiniz (Başlık, Liste, Kod vb.)
- **Backspace** ile boş bloğu silebilirsiniz
- **Sürükle & Bırak** ile blokların yerini değiştirebilirsiniz

## Blok Türleri

Command Panel (/) ile şu blokları oluşturabilirsiniz:

1. Başlıklar (H1, H2, H3)
2. Numaralı Liste
3. Madde İşareti Listesi
4. Yapılacaklar Listesi
5. Alıntı Bloğu
6. Kod Bloğu
7. Açılır Blok (Toggle)
8. Bilgi Kutusu (Callout)
9. Ayraç (Divider)

## Klavye Kısayolları

- **Ctrl + S** - Kaydet
- **Ctrl + Z** - Geri Al
- **Ctrl + Y** - İleri Al
- **/** - Command Panel aç
- **Enter** - Yeni blok ekle

---

İyi çalışmalar! Yeni notlar oluşturmak için sol paneli kullanabilirsiniz.`;

        // Dosyayi olustur
        await invoke("save_file_content", {
          path: `${selectedPath}/Hosgeldin.md`.replace("//", "/"),
          content: welcomeContent
        });

        // Listeyi tekrar guncelle
        result = await invoke("list_files", { path: selectedPath }) as FileNode[];
      }

      setFiles(result);
      setPath(selectedPath);

      // Kaydet
      localStorage.setItem("petbottle_last_directory", selectedPath);
      localStorage.setItem("petbottle_setup_complete", "true");
      setIsSetupComplete(true);

      // Varsa Hosgeldin.md dosyasini otomatik ac
      if (result.some(f => f.name === "Hosgeldin.md")) {
        // State update sonrasi calismasi icin kisa bir gecikme veya useEffect kullanilabilir
        // Ancak burada state henuz tam oturmamis olabilir, bu yuzden App component render olduktan sonra
        // kullanici kendisi secebilir veya biz burada setSelectedFile yapabiliriz ama
        // openFile fonksiyonu path state'ine bagli oldugu icin burada cagirmak riskli olabilir.
        // Basitlik adina dosyayi secmesini bekleyelim veya dosya listesinde gorecektir.
      }

    } catch (err) {
      console.error("Setup tamamlanamadi:", err);
      // Hata durumunda SetupScreen'e hatayi firlat
      throw err;
    }
  };

  // Dosya listele
  async function getFiles() {
    try {
      const result = await invoke("list_files", { path: path });
      setFiles(result as FileNode[]);
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

      // Dosya zaten absolute path olarak geliyor openFile'a (artık folder tıklandığında path.join edilecek UI tarafında ya da Node içinden path alınacak).
      // Biz doğrudan 'file' pathini alıp açabiliriz.
      const fullPath = file;

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
  const createFile = useCallback(async (dirPath: string, filename: string) => {
    if (!dirPath || !filename.trim()) {
      showToastMessage("Dosya adı boş olamaz", "error");
      return;
    }

    try {
      const newFileName = await invoke<string>("create_file", {
        directory: dirPath,
        filename: filename.trim(),
      });

      getFiles(); // Ağaç yapısını tekrar çek
      showToastMessage(`"${newFileName}" oluşturuldu`, "success");

      // Yeni dosyayi ac
      // Path tam olarak birleştirilecek. FileNode'lardaki path formatına göre açıyoruz.
      const sep = dirPath.endsWith("/") || dirPath.endsWith("\\") ? "" : "/";
      const fullPath = `${dirPath}${sep}${newFileName}`;
      await openFile(fullPath);
    } catch (error) {
      console.error("Dosya olusturulamadi:", error);
      showToastMessage("Dosya oluşturulamadı: " + error, "error");
    }
  }, [path]);

  // Dosya sil (performansli)
  const deleteFile = useCallback(async (dirPath: string, filename: string, fullPath: string) => {
    if (!dirPath || !filename) return;

    try {
      await invoke("delete_file", {
        directory: dirPath,
        filename: filename,
      });

      // Ağacı tekrar çek
      getFiles();

      // Silinen dosya acik dosya ise kapat
      if (selectedFile === fullPath) {
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
  }, [selectedFile, docId]);

  // Yeni klasör oluştur
  const createDirectory = useCallback(async (dirPath: string, dirname: string) => {
    if (!dirPath || !dirname.trim()) {
      showToastMessage("Klasör adı boş olamaz", "error");
      return;
    }

    try {
      const newDirName = await invoke<string>("create_directory", {
        directory: dirPath,
        dirname: dirname.trim(),
      });

      getFiles();
      showToastMessage(`Klasör "${newDirName}" oluşturuldu`, "success");
    } catch (error) {
      console.error("Klasör olusturulamadi:", error);
      showToastMessage("Klasör oluşturulamadı: " + error, "error");
    }
  }, []);

  // Klasör sil
  const deleteDirectory = useCallback(async (dirPath: string, dirname: string) => {
    if (!dirPath || !dirname) return;

    try {
      await invoke("delete_directory", {
        directory: dirPath,
        dirname: dirname,
      });

      getFiles();
      showToastMessage(`Klasör "${dirname}" silindi`, "success");
    } catch (error) {
      console.error("Klasör silinemedi:", error);
      showToastMessage("Klasör silinemedi: " + error, "error");
    }
  }, []);

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

    // UI'da aninda guncelle
    setBlocks(prev => updateBlockRecursive(prev, id, newContent));

    try {
      // Backend tarafında bloğun içeriğini güncelle
      await invoke("update_block", { docId, blockId: id, content: newContent });

      // Debounced History
      if (historyDebounceRef.current) {
        clearTimeout(historyDebounceRef.current);
      }
      historyDebounceRef.current = setTimeout(async () => {
        try {
          await invoke("save_content_snapshot", { docId });
        } catch (error) {
          console.error("History kaydedilemedi:", error);
        }
      }, 500);

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

  // Blogu paragrafa donustur (backspace ile demote)
  const demoteBlock = useCallback(async (blockId: string) => {
    if (!docId) return;
    await changeBlockType(blockId, "paragraph");
  }, [docId, changeBlockType]);

  // Blogun derinligini (depth) azalt
  const decreaseDepth = useCallback(async (blockId: string) => {
    if (!docId) return;
    try {
      await invoke("decrease_depth", { docId, blockId });
      const updatedBlocks = await invoke("get_blocks", { docId }) as Block[];
      setBlocks(updatedBlocks);
    } catch (error) {
      console.error("Depth azaltilamadi:", error);
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
  // DRAG & DROP — Görsel gösterge sistemi
  // ----------------------------------------------------------------------------

  const [dropIndicator, setDropIndicator] = useState<DropIndicatorState | null>(null);

  const handleDragStart = useCallback((_event: DragStartEvent) => {
    // Sürükleme başladı — gelecekte kullanılabilir
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setDropIndicator(null);
      return;
    }

    // Mouse pozisyonu hesapla
    const mouseY = (event.activatorEvent as MouseEvent)?.clientY || 0;
    const currentMouseY = mouseY + (event.delta?.y || 0);
    const currentMouseX = (event.activatorEvent as MouseEvent)?.clientX + (event.delta?.x || 0) || 0;

    // Over rect'i direkt kullan — dnd-kit'in kendi rect hesaplaması
    let targetRect: DOMRect | null = null;

    // Hedef element'i ID ile bul
    const targetEl = document.querySelector(`[data-sortable-id="${over.id}"]`) as HTMLElement;
    if (targetEl) {
      targetRect = targetEl.getBoundingClientRect();
    } else {
      // Fallback: tüm block'ları tara
      const allBlocks = document.querySelectorAll('.block');
      for (const el of allBlocks) {
        const sortableId = el.closest('[style]')?.querySelector('.drag-handle')?.parentElement;
        if (sortableId) {
          const rect = sortableId.getBoundingClientRect();
          if (currentMouseY >= rect.top && currentMouseY <= rect.bottom) {
            targetRect = rect;
            break;
          }
        }
      }
    }

    if (!targetRect) {
      // Son çare: basit üst/alt hesaplaması
      setDropIndicator({
        targetId: over.id as string,
        position: "below",
      });
      return;
    }

    const relativeY = (currentMouseY - targetRect.top) / targetRect.height;
    const relativeX = (currentMouseX - targetRect.left) / targetRect.width;

    let position: DropPosition;
    if (relativeX > 0.75) {
      position = "right"; // Çocuk olarak ekleme (nesting)
    } else if (relativeY < 0.3) {
      position = "above";
    } else if (relativeY > 0.7) {
      position = "below";
    } else {
      position = "below"; // Varsayılan
    }

    setDropIndicator({
      targetId: over.id as string,
      position,
    });
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    const currentIndicator = dropIndicator;

    // Temizle
    setDropIndicator(null);

    if (!over || active.id === over.id || !docId) return;

    // Gösterge pozisyonuna göre asChild belirle
    const asChild = currentIndicator?.position === "right";

    try {
      const updatedBlocks = await invoke("move_block", {
        docId,
        blockId: active.id as string,
        targetId: over.id as string,
        asChild,
      }) as Block[];

      setBlocks(updatedBlocks);
    } catch (error) {
      console.error("Blok tasinamadi:", error);
    }
  }, [docId, dropIndicator]);

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
        <Sidebar
          path={path}
          setPath={setPath}
          files={files}
          selectedFile={selectedFile}
          getFiles={getFiles}
          openFile={openFile}
          createFile={createFile}
          deleteFile={deleteFile}
          createDirectory={createDirectory}
          deleteDirectory={deleteDirectory}
          showNewFileInput={showNewFileInput}
          setShowNewFileInput={setShowNewFileInput}
          newFileName={newFileName}
          setNewFileName={setNewFileName}
        />
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
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
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
                    onDemoteBlock={demoteBlock}
                    onDecreaseDepth={decreaseDepth}
                    onFocusBlock={focusBlock}
                    updateBlockContent={updateBlockContent}
                    onShowCommandPanel={(blockId, position) => {
                      setCommandPanelBlockId(blockId);
                      setCommandPanelPosition(position);
                      setCommandPanelOpen(true);
                    }}
                    onToggleCollapse={toggleCollapse}
                    siblings={blocks}
                    dropIndicator={dropIndicator}
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
