import { useState, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Block, DropIndicatorState } from "../types";
import { BlockContent } from "./BlockContent";

export const SortableBlock = ({
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
  onToggleCheckbox,
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
  onToggleCheckbox?: () => void;
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
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging && {
      opacity: 0.4,
      zIndex: 999,
    }),
  };

  const isDropTarget = dropIndicator?.targetId === block.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`editor-row ${isFocused ? "focused" : ""} ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}`}
      onMouseDown={onMouseDown}
      data-sortable-id={block.id}
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
        onToggleCheckbox={onToggleCheckbox}
        listIndex={listIndex}
      />
    </div>
  );
};
