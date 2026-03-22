import { useState } from "react";
import { FileNode } from "./App";
import { File, Folder, FolderOpen, Trash2, FilePlus, FolderPlus, Check, X, FileText, PanelLeftClose } from "lucide-react";

interface SidebarProps {
  path: string;
  files: FileNode[];
  selectedFile: string | null;
  openFile: (file: string) => void;
  createFile: (dirPath: string, filename: string) => void;
  deleteFile: (dirPath: string, filename: string, fullPath: string) => void;
  createDirectory: (dirPath: string, dirname: string) => void;
  deleteDirectory: (dirPath: string, dirname: string) => void;
  showNewFileInput: boolean;
  setShowNewFileInput: (show: boolean) => void;
  newFileName: string;
  setNewFileName: (name: string) => void;
  onClose: () => void;
  onConfirmDelete: (message: string, onConfirm: () => void) => void;
}

const FileTreeNode = ({
  node,
  level,
  selectedFile,
  openFile,
  createFile,
  deleteFile,
  createDirectory,
  deleteDirectory,
  onConfirmDelete,
}: {
  node: FileNode;
  level: number;
  selectedFile: string | null;
  openFile: (file: string) => void;
  createFile: (dirPath: string, filename: string) => void;
  deleteFile: (dirPath: string, filename: string, fullPath: string) => void;
  createDirectory: (dirPath: string, dirname: string) => void;
  deleteDirectory: (dirPath: string, dirname: string) => void;
  onConfirmDelete: (message: string, onConfirm: () => void) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showInputFor, setShowInputFor] = useState<"file" | "dir" | null>(null);
  const [inputValue, setInputValue] = useState("");

  const isSelected = selectedFile === node.path;
  const paddingLeft = level * 12 + 12;

  if (!node.is_dir) {
    return (
      <div
        className={`file-item ${isSelected ? "active" : ""}`}
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={() => openFile(node.path)}
      >
        <File size={14} style={{ marginRight: "8px", color: "var(--text-muted)" }} />
        <span className="file-card-name" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {node.name.replace(/\.[^/.]+$/, "")}
        </span>
        <span className="file-card-extension" style={{ fontSize: "11px", color: "var(--text-muted)", marginRight: "8px" }}>
          {node.name.includes(".") ? `.${node.name.split(".").pop()}` : ""}
        </span>
          <button
          className="btn btn-icon btn-ghost file-card-delete"
          style={{ width: "24px", height: "24px", padding: 0 }}
          onClick={(e) => {
            e.stopPropagation();
            const separator = node.path.includes("/") ? "/" : "\\";
            const dirPath = node.path.substring(0, node.path.lastIndexOf(separator));
            onConfirmDelete(`"${node.name}" silinsin mi?`, () => deleteFile(dirPath, node.name, node.path));
          }}
          title="Dosyayı sil"
        >
          <Trash2 size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="folder-node">
      <div
        className="file-item folder-item"
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <FolderOpen size={14} style={{ marginRight: "8px", color: "var(--brand-main)" }} /> : <Folder size={14} style={{ marginRight: "8px", color: "var(--text-muted)" }} />}
        <span className="folder-card-name" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {node.name}
        </span>
        
        <div className="folder-card-actions" onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: "2px" }}>
           <button
             className="btn btn-icon btn-ghost sidebar-btn-xs"
             style={{ width: "24px", height: "24px", padding: 0 }}
             onClick={() => { setIsOpen(true); setShowInputFor("file"); setInputValue(""); }}
             title="Yeni Dosya"
           >
             <FilePlus size={12} />
           </button>
           <button
             className="btn btn-icon btn-ghost sidebar-btn-xs"
             style={{ width: "24px", height: "24px", padding: 0 }}
             onClick={() => { setIsOpen(true); setShowInputFor("dir"); setInputValue(""); }}
             title="Yeni Klasör"
           >
             <FolderPlus size={12} />
           </button>
           <button
             className="btn btn-icon btn-ghost file-card-delete"
             style={{ width: "24px", height: "24px", padding: 0 }}
             onClick={() => {
               const separator = node.path.includes("/") ? "/" : "\\";
               const dirPath = node.path.substring(0, node.path.lastIndexOf(separator));
               onConfirmDelete(`"${node.name}" klasörü silinsin mi?`, () => deleteDirectory(dirPath, node.name));
             }}
             title="Klasörü sil"
           >
             <Trash2 size={12} />
           </button>
        </div>
      </div>

      {isOpen && showInputFor && (
        <div className="new-file-input-container" style={{ paddingLeft: `${paddingLeft + 12}px`, marginTop: "4px", marginBottom: "4px", display: "flex", gap: "4px" }}>
          <input
            className="form-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={showInputFor === "file" ? "Dosya adı..." : "Klasör adı..."}
            autoFocus
            style={{ width: "120px", padding: "4px 8px", fontSize: "12px", height: "24px" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && inputValue.trim()) {
                if (showInputFor === "file") createFile(node.path, inputValue.trim());
                else createDirectory(node.path, inputValue.trim());
                setShowInputFor(null);
                setInputValue("");
              } else if (e.key === "Escape") {
                setShowInputFor(null);
                setInputValue("");
              }
            }}
          />
          <button
            className="btn btn-icon btn-primary"
            style={{ width: "24px", height: "24px", padding: 0 }}
            onClick={() => {
              if (inputValue.trim()) {
                if (showInputFor === "file") createFile(node.path, inputValue.trim());
                else createDirectory(node.path, inputValue.trim());
                setShowInputFor(null);
                setInputValue("");
              }
            }}
          >
            <Check size={12} />
          </button>
          <button
            className="btn btn-icon btn-danger"
            style={{ width: "24px", height: "24px", padding: 0 }}
            onClick={() => {
              setShowInputFor(null);
              setInputValue("");
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Render children */}
      {isOpen && node.children && (
        <div className="folder-children">
          {node.children.map((child, i) => (
            <FileTreeNode
              key={i}
              node={child}
              level={level + 1}
              selectedFile={selectedFile}
              openFile={openFile}
              createFile={createFile}
              deleteFile={deleteFile}
              createDirectory={createDirectory}
              deleteDirectory={deleteDirectory}
              onConfirmDelete={onConfirmDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const Sidebar = ({
  path,
  files,
  selectedFile,
  openFile,
  createFile,
  deleteFile,
  createDirectory,
  deleteDirectory,
  showNewFileInput,
  setShowNewFileInput,
  newFileName,
  setNewFileName,
  onClose,
  onConfirmDelete,
}: SidebarProps) => {
  return (
    <aside className="sidebar" id="sidebar">
      {/* Header - Standard Petbottle Header */}
      <div className="sidebar-header">
        <span>Petbottle Workspace</span>
        <div className="sidebar-actions">
          <button className="btn btn-icon btn-ghost" onClick={onClose} title="Kapat">
            <PanelLeftClose size={16} />
          </button>
        </div>
      </div>

      {/* Workspace Actions (New File/Folder Only) */}
      <div style={{ padding: "12px", borderBottom: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "8px" }}>
        {files.length > 0 && (
          <div className="sidebar-file-actions" style={{ display: "flex", gap: "4px", width: "100%" }}>
            {showNewFileInput ? (
              <div className="new-file-input-container" style={{ display: "flex", gap: "4px" }}>
                <input
                  className="form-input"
                  style={{ fontSize: "12px", height: "26px", padding: "4px 8px" }}
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="Dosya veya Klasör..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFileName.trim()) {
                      createFile(path, newFileName);
                      setNewFileName("");
                      setShowNewFileInput(false);
                    } else if (e.key === "Escape") {
                      setNewFileName("");
                      setShowNewFileInput(false);
                    }
                  }}
                />
                <button
                  className="btn btn-icon btn-secondary"
                  style={{ width: "26px", height: "26px", padding: 0 }}
                  title="Dosya Oluştur"
                  onClick={() => {
                    if (newFileName.trim()) {
                      createFile(path, newFileName);
                      setNewFileName("");
                      setShowNewFileInput(false);
                    }
                  }}
                >
                  <FileText size={14} />
                </button>
                 <button
                  className="btn btn-icon btn-secondary"
                  style={{ width: "26px", height: "26px", padding: 0 }}
                  title="Klasör Oluştur"
                  onClick={() => {
                    if (newFileName.trim()) {
                      createDirectory(path, newFileName);
                      setNewFileName("");
                      setShowNewFileInput(false);
                    }
                  }}
                >
                  <FolderPlus size={14} />
                </button>
                <button
                  className="btn btn-icon btn-danger"
                  style={{ width: "26px", height: "26px", padding: 0 }}
                  onClick={() => {
                    setNewFileName("");
                    setShowNewFileInput(false);
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                className="btn btn-secondary"
                style={{ flex: 1, fontSize: "12px", padding: "6px" }}
                onClick={() => setShowNewFileInput(true)}
              >
                <FilePlus size={14} style={{ marginRight: "6px" }} />
                + Yeni Öge
              </button>
            )}
          </div>
        )}
      </div>

      {/* File list (Root level nodes) */}
      <div className="file-list">
        {files.map((node, i) => (
          <FileTreeNode
            key={i}
            node={node}
            level={0}
            selectedFile={selectedFile}
            openFile={openFile}
            createFile={createFile}
            deleteFile={deleteFile}
            createDirectory={createDirectory}
            deleteDirectory={deleteDirectory}
            onConfirmDelete={onConfirmDelete}
          />
        ))}
      </div>
    </aside>
  );
};
