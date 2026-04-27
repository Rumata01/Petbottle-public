import React, { useEffect, useRef, memo } from "react";
import ContentEditable, { ContentEditableEvent } from "react-contenteditable";
import DOMPurify from "dompurify";
import { MessageSquare, ChevronRight } from "lucide-react";
import { Block } from "../types";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-markdown";

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
  onToggleCheckbox,
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
  onToggleCheckbox?: () => void;
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
      const text = contentRef.current.innerText || contentRef.current.textContent || "";
      if (text.trim() === "") {
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
        return `block-h${block.depth || 1}`;
      case "paragraph":
        return "block-text";
      case "bullet-list":
      case "numbered-list":
        return "block-text";
      case "checkbox":
        return "task-text block-text";
      case "quote":
      case "callout":
        return "block-text";
      case "code":
        return "block-code";
      default:
        return "block-text";
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
          <div className="block block-list" style={{ display: 'flex', gap: '8px' }}>
            <span className="block-prefix">•</span>
            {contentElement}
          </div>
        );

      case "numbered-list":
        return (
          <div className="block block-list" style={{ display: 'flex', gap: '8px' }}>
            <span className="block-prefix" style={{ minWidth: '1.5rem' }}>{(listIndex ?? 0) + 1}.</span>
            {contentElement}
          </div>
        );

      case "checkbox":
        return (
          <div className="task-item">
            <input
              type="checkbox"
              className="task-checkbox"
              checked={block.isChecked || false}
              onChange={() => {
                onToggleCheckbox?.();
              }}
            />
            {contentElement}
          </div>
        );

      case "quote":
        return (
          <blockquote className="block-quote">
            {contentElement}
          </blockquote>
        );

      case "code":
        return (
          <div className="block-code-wrapper" data-language={block.infoString || "text"}>
            <div style={{ position: "absolute", top: 0, right: 0, zIndex: 10 }}>
              <select 
                value={block.infoString || "text"}
                onChange={(e) => {
                  const evt = new CustomEvent("petbottle-update-info-string", {
                    detail: { blockId: block.id, infoString: e.target.value }
                  });
                  window.dispatchEvent(evt);
                }}
                style={{
                  background: "var(--gray-800)",
                  color: "var(--gray-400)",
                  border: "none",
                  borderBottomLeftRadius: "var(--radius-sm)",
                  padding: "4px 8px",
                  fontSize: "12px",
                  outline: "none",
                  cursor: "pointer"
                }}
              >
                 <option value="text">Plain Text</option>
                 <option value="javascript">JavaScript</option>
                 <option value="typescript">TypeScript</option>
                 <option value="python">Python</option>
                 <option value="rust">Rust</option>
                 <option value="html">HTML</option>
                 <option value="css">CSS</option>
                 <option value="json">JSON</option>
                 <option value="bash">Bash</option>
                 <option value="markdown">Markdown</option>
              </select>
            </div>
            <Editor
              value={block.content || ""}
              onValueChange={(code) => onUpdate(block.id, code)}
              highlight={(code) => {
                const lang = block.infoString || "text";
                const grammar = Prism.languages[lang] || Prism.languages.javascript;
                return Prism.highlight(code, grammar, lang);
              }}
              padding={16}
              style={{
                fontFamily: 'var(--font-code)',
                fontSize: '0.9em',
                lineHeight: 1.5,
                background: 'transparent',
                outline: 'none',
                width: '100%'
              }}
              className="editor-textarea"
              onKeyDown={handleKeyDown}
            />
          </div>
        );

      case "callout":
        return (
          <div className="block-callout info">
            <MessageSquare size={16} className="callout-icon" style={{ marginTop: "2px" }} />
            {contentElement}
          </div>
        );

      case "toggle":
        return (
          <div className={`block-toggle ${block.isCollapsed === false ? "open" : ""}`}>
            <summary className="toggle-header" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <ChevronRight size={16} className="toggle-icon" onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onToggleCollapse?.();
              }} />
              <div style={{ flex: 1 }}>{contentElement}</div>
            </summary>
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

export const BlockContent = memo(BlockContentInner, (prev, next) => {
  if (prev.block.id !== next.block.id) return false;
  if (prev.block.type !== next.block.type) return false;
  if (prev.block.depth !== next.block.depth) return false;
  if (prev.block.isCollapsed !== next.block.isCollapsed) return false;
  if (prev.block.isChecked !== next.block.isChecked) return false;
  if (prev.block.infoString !== next.block.infoString) return false;

  if (prev.isFocused !== next.isFocused) return false;
  if (prev.shouldMoveCursorToEnd !== next.shouldMoveCursorToEnd) return false;
  if (prev.listIndex !== next.listIndex) return false;
  if (prev.onDemoteBlock !== next.onDemoteBlock) return false;
  if (prev.onDecreaseDepth !== next.onDecreaseDepth) return false;

  if (prev.isFocused && next.isFocused) return true;
  if (next.isFocused) return true;

  return prev.block.content === next.block.content;
});
