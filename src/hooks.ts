// ============================================================================
// hooks.ts - React Hooks (Rust ile İletişim)
// ============================================================================
//
// Bu dosya, React tarafında Rust backend ile iletişimi sağlayan
// custom hook'ları içerir.
//
// NEDEN CUSTOM HOOKS?
// - Kod tekrarını önler
// - Rust IPC çağrılarını soyutlar
// - Hata yönetimini merkezileştirir
// - Test edilmesi kolaydır
//
// KULLANIM:
// const { blocks, updateBlock, addBlock, undo, redo } = useDocument(docId);
// ============================================================================

import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// TİP TANIMLARI
// ============================================================================

// Block tipi (Rust'taki Block struct'ının TypeScript karşılığı)
export interface Block {
  id: string;
  type: string; // BlockType enum → string olarak gelir
  content: string;
  depth?: number; // Heading için (1-6)
  children?: Block[]; // Nested bloklar
  isCollapsed?: boolean; // Toggle için
}

// Document state'i
export interface DocumentState {
  blocks: Block[];
  isSaving: boolean;
  isDirty: boolean;
  lastError: string | null;
}

// Hook'un döndürüleceği değerler
export interface UseDocumentReturn {
  // State
  blocks: Block[];
  isLoading: boolean;
  isSaving: boolean;
  isDirty: boolean;
  error: string | null;

  // Actions
  updateBlock: (blockId: string, content: string) => Promise<void>;
  addBlock: (afterId: string, exitToParent?: boolean) => Promise<Block | null>;
  deleteBlock: (blockId: string) => Promise<string | null>;
  moveBlock: (
    blockId: string,
    targetId: string,
    asChild?: boolean,
  ) => Promise<void>;
  changeBlockType: (
    blockId: string,
    newType: string,
    depth?: number,
  ) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  save: () => Promise<void>;
}

// ============================================================================
// useDocument HOOK
// ============================================================================
//
// Bir dökümanı yönetmek için ana hook.
// Rust backend ile tüm iletişimi sağlar.
//
// KULLANIM:
// const { blocks, updateBlock, save } = useDocument("/path/to/file.md");
// ============================================================================

export function useDocument(filePath: string | null): UseDocumentReturn {
  // -------------------------------------------------------------------------
  // STATE
  // -------------------------------------------------------------------------

  // Döküman ID (Rust tarafından döner)
  const [docId, setDocId] = useState<string | null>(null);

  // Bloklar
  const [blocks, setBlocks] = useState<Block[]>([]);

  // Loading state'leri
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Değişiklik durumu
  const [isDirty, setIsDirty] = useState(false);

  // Hata mesajı
  const [error, setError] = useState<string | null>(null);

  // Cleanup için ref
  const docIdRef = useRef<string | null>(null);

  // -------------------------------------------------------------------------
  // DÖKÜMAN AÇMA
  // -------------------------------------------------------------------------
  //
  // filePath değiştiğinde dökümanı aç
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!filePath) {
      // Path yoksa state'i sıfırla
      setBlocks([]);
      setDocId(null);
      return;
    }

    async function openDocument() {
      setIsLoading(true);
      setError(null);

      try {
        // Rust: Dosyayı aç ve parse et
        // Dönen değer: [docId, blocks]
        const [id, parsedBlocks] = await invoke<[string, Block[]]>(
          "open_document",
          {
            path: filePath,
          },
        );

        setDocId(id);
        docIdRef.current = id;
        setBlocks(parsedBlocks);
        setIsDirty(false);
      } catch (err) {
        setError(String(err));
        console.error("Döküman açılamadı:", err);
      } finally {
        setIsLoading(false);
      }
    }

    openDocument();

    // Cleanup: Dökümanı kapat
    return () => {
      if (docIdRef.current) {
        invoke("close_document", { docId: docIdRef.current }).catch(
          console.error,
        );
      }
    };
  }, [filePath]);

  // -------------------------------------------------------------------------
  // BLOK GÜNCELLEME
  // -------------------------------------------------------------------------
  //
  // Kullanıcı yazı yazdığında çağrılır.
  // Optimistic update: Önce UI'ı güncelle, sonra Rust'a bildir.
  //
  // useCallback:
  // Fonksiyonu memoize eder, gereksiz yeniden oluşturmaları önler.
  // -------------------------------------------------------------------------

  const updateBlock = useCallback(
    async (blockId: string, content: string) => {
      if (!docId) return;

      // Optimistic update: Hemen UI'ı güncelle
      setBlocks((prev) => updateBlockRecursive(prev, blockId, content));
      setIsDirty(true);

      try {
        // Rust'a bildir
        await invoke("update_block", {
          docId,
          blockId,
          content,
        });
      } catch (err) {
        // Hata durumunda: Bloğu geri al (TODO: implement rollback)
        setError(String(err));
        console.error("Blok güncellenemedi:", err);
      }
    },
    [docId],
  );

  // -------------------------------------------------------------------------
  // BLOK EKLEME
  // -------------------------------------------------------------------------
  //
  // Enter tuşuna basıldığında çağrılır.
  // Yeni bloğu Rust oluşturur ve döndürür.
  // -------------------------------------------------------------------------

  const addBlock = useCallback(
    async (afterId: string, exitToParent = false): Promise<Block | null> => {
      if (!docId) return null;

      try {
        // Rust: Yeni blok oluştur
        const newBlock = await invoke<Block>("add_block", {
          docId,
          afterId,
          exitToParent,
        });

        // UI'ı güncelle
        setBlocks((prev) => addBlockAfter(prev, afterId, newBlock));
        setIsDirty(true);

        return newBlock;
      } catch (err) {
        setError(String(err));
        console.error("Blok eklenemedi:", err);
        return null;
      }
    },
    [docId],
  );

  // -------------------------------------------------------------------------
  // BLOK SİLME
  // -------------------------------------------------------------------------
  //
  // Boş blokta Backspace'e basıldığında çağrılır.
  // Önceki bloğun ID'sini döndürür (focus için).
  // -------------------------------------------------------------------------

  const deleteBlock = useCallback(
    async (blockId: string): Promise<string | null> => {
      if (!docId) return null;

      try {
        // Rust: Bloğu sil
        const prevBlockId = await invoke<string | null>("delete_block", {
          docId,
          blockId,
        });

        // UI'ı güncelle
        setBlocks((prev) => removeBlockById(prev, blockId));
        setIsDirty(true);

        return prevBlockId;
      } catch (err) {
        setError(String(err));
        console.error("Blok silinemedi:", err);
        return null;
      }
    },
    [docId],
  );

  // -------------------------------------------------------------------------
  // BLOK TAŞIMA
  // -------------------------------------------------------------------------
  //
  // Drag & Drop ile çağrılır.
  // -------------------------------------------------------------------------

  const moveBlock = useCallback(
    async (
      blockId: string,
      targetId: string,
      asChild = false,
    ): Promise<void> => {
      if (!docId) return;

      try {
        // Rust: Bloğu taşı ve yeni listeyi al
        const newBlocks = await invoke<Block[]>("move_block", {
          docId,
          blockId,
          targetId,
          asChild,
        });

        setBlocks(newBlocks);
        setIsDirty(true);
      } catch (err) {
        setError(String(err));
        console.error("Blok taşınamadı:", err);
      }
    },
    [docId],
  );

  // -------------------------------------------------------------------------
  // BLOK TÜRÜ DEĞİŞTİRME
  // -------------------------------------------------------------------------
  //
  // Command Panel'den seçim yapıldığında çağrılır.
  // -------------------------------------------------------------------------

  const changeBlockType = useCallback(
    async (blockId: string, newType: string, depth?: number): Promise<void> => {
      if (!docId) return;

      // Optimistic update
      setBlocks((prev) =>
        changeBlockTypeRecursive(prev, blockId, newType, depth),
      );
      setIsDirty(true);

      try {
        await invoke("change_block_type", {
          docId,
          blockId,
          newType,
          depth,
        });
      } catch (err) {
        setError(String(err));
        console.error("Blok türü değiştirilemedi:", err);
      }
    },
    [docId],
  );

  // -------------------------------------------------------------------------
  // UNDO (Geri Al)
  // -------------------------------------------------------------------------

  const undo = useCallback(async (): Promise<void> => {
    if (!docId) return;

    try {
      const result = await invoke<Block[] | null>("undo", { docId });

      if (result) {
        setBlocks(result);
        setIsDirty(true);
      }
    } catch (err) {
      setError(String(err));
      console.error("Undo başarısız:", err);
    }
  }, [docId]);

  // -------------------------------------------------------------------------
  // REDO (Yinele)
  // -------------------------------------------------------------------------

  const redo = useCallback(async (): Promise<void> => {
    if (!docId) return;

    try {
      const result = await invoke<Block[] | null>("redo", { docId });

      if (result) {
        setBlocks(result);
        setIsDirty(true);
      }
    } catch (err) {
      setError(String(err));
      console.error("Redo başarısız:", err);
    }
  }, [docId]);

  // -------------------------------------------------------------------------
  // KAYDETME
  // -------------------------------------------------------------------------

  const save = useCallback(async (): Promise<void> => {
    if (!docId) return;

    setIsSaving(true);

    try {
      await invoke("save_document", { docId });
      setIsDirty(false);
    } catch (err) {
      setError(String(err));
      console.error("Kaydetme başarısız:", err);
    } finally {
      setIsSaving(false);
    }
  }, [docId]);

  // -------------------------------------------------------------------------
  // RETURN
  // -------------------------------------------------------------------------

  return {
    blocks,
    isLoading,
    isSaving,
    isDirty,
    error,
    updateBlock,
    addBlock,
    deleteBlock,
    moveBlock,
    changeBlockType,
    undo,
    redo,
    save,
  };
}

// ============================================================================
// YARDIMCI FONKSİYONLAR
// ============================================================================
//
// Bu fonksiyonlar, blok listesini immutable şekilde günceller.
// React state güncellemeleri için gerekli.
// ============================================================================

/**
 * Blok içeriğini recursive olarak güncelle
 */
function updateBlockRecursive(
  blocks: Block[],
  id: string,
  content: string,
): Block[] {
  return blocks.map((block) => {
    if (block.id === id) {
      return { ...block, content };
    }
    if (block.children) {
      return {
        ...block,
        children: updateBlockRecursive(block.children, id, content),
      };
    }
    return block;
  });
}

/**
 * Belirtilen bloğun hemen sonrasına yeni blok ekle
 */
function addBlockAfter(
  blocks: Block[],
  afterId: string,
  newBlock: Block,
): Block[] {
  const result: Block[] = [];

  for (const block of blocks) {
    result.push(block);

    if (block.id === afterId) {
      result.push(newBlock);
    } else if (block.children) {
      // Deep copy with recursive add
      const newChildren = addBlockAfter(block.children, afterId, newBlock);
      if (newChildren !== block.children) {
        result[result.length - 1] = { ...block, children: newChildren };
      }
    }
  }

  return result;
}

/**
 * Bloğu ID'ye göre sil
 */
function removeBlockById(blocks: Block[], id: string): Block[] {
  return blocks
    .filter((block) => block.id !== id)
    .map((block) => {
      if (block.children) {
        return { ...block, children: removeBlockById(block.children, id) };
      }
      return block;
    });
}

/**
 * Blok türünü recursive olarak değiştir
 */
function changeBlockTypeRecursive(
  blocks: Block[],
  id: string,
  newType: string,
  depth?: number,
): Block[] {
  return blocks.map((block) => {
    if (block.id === id) {
      return { ...block, type: newType, depth };
    }
    if (block.children) {
      return {
        ...block,
        children: changeBlockTypeRecursive(block.children, id, newType, depth),
      };
    }
    return block;
  });
}

// ============================================================================
// useKeyboardShortcuts HOOK
// ============================================================================
//
// Klavye kısayollarını yönetir.
// ============================================================================

export function useKeyboardShortcuts(options: {
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}) {
  const { onSave, onUndo, onRedo } = options;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd tuşu basılı mı?
      const isCtrl = e.ctrlKey || e.metaKey;

      if (!isCtrl) return;

      switch (e.key.toLowerCase()) {
        case "s":
          // Ctrl+S: Kaydet
          e.preventDefault();
          onSave?.();
          break;

        case "z":
          if (e.shiftKey) {
            // Ctrl+Shift+Z: Redo
            e.preventDefault();
            onRedo?.();
          } else {
            // Ctrl+Z: Undo
            e.preventDefault();
            onUndo?.();
          }
          break;

        case "y":
          // Ctrl+Y: Redo
          e.preventDefault();
          onRedo?.();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSave, onUndo, onRedo]);
}

// ============================================================================
// KULLANIM ÖRNEĞİ
// ============================================================================
//
// function Editor({ filePath }: { filePath: string }) {
//   const {
//     blocks,
//     isLoading,
//     isDirty,
//     updateBlock,
//     addBlock,
//     deleteBlock,
//     undo,
//     redo,
//     save,
//   } = useDocument(filePath);
//
//   // Klavye kısayollarını bağla
//   useKeyboardShortcuts({
//     onSave: save,
//     onUndo: undo,
//     onRedo: redo,
//   });
//
//   if (isLoading) return <div>Yükleniyor...</div>;
//
//   return (
//     <div>
//       {isDirty && <span>Kaydedilmemiş değişiklikler</span>}
//       {blocks.map((block) => (
//         <BlockComponent
//           key={block.id}
//           block={block}
//           onUpdate={(content) => updateBlock(block.id, content)}
//           onAddNext={() => addBlock(block.id)}
//           onRemove={() => deleteBlock(block.id)}
//         />
//       ))}
//     </div>
//   );
// }
// ============================================================================
