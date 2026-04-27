
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Block, DropIndicatorState } from "../types";
import { SortableBlock } from "./SortableBlock";

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
  onToggleCheckbox?: (blockId: string) => void;
  siblings?: Block[];
  dropIndicator?: DropIndicatorState | null;
}

export const NestedSortableBlock = ({
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
  onToggleCheckbox,
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
        onToggleCheckbox={onToggleCheckbox ? () => onToggleCheckbox(block.id) : undefined}
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
                onToggleCheckbox={onToggleCheckbox}
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
