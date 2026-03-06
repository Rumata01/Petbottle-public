import { useState } from "react";
import { FileNode } from "./App";

interface SidebarProps {
  path: string;
  setPath: (path: string) => void;
  files: FileNode[];
  selectedFile: string | null;
  getFiles: () => void;
  openFile: (file: string) => void;
  createFile: (dirPath: string, filename: string) => void;
  deleteFile: (dirPath: string, filename: string, fullPath: string) => void;
  createDirectory: (dirPath: string, dirname: string) => void;
  deleteDirectory: (dirPath: string, dirname: string) => void;
  showNewFileInput: boolean;
  setShowNewFileInput: (show: boolean) => void;
  newFileName: string;
  setNewFileName: (name: string) => void;
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
}: {
  node: FileNode;
  level: number;
  selectedFile: string | null;
  openFile: (file: string) => void;
  createFile: (dirPath: string, filename: string) => void;
  deleteFile: (dirPath: string, filename: string, fullPath: string) => void;
  createDirectory: (dirPath: string, dirname: string) => void;
  deleteDirectory: (dirPath: string, dirname: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showInputFor, setShowInputFor] = useState<"file" | "dir" | null>(null);
  const [inputValue, setInputValue] = useState("");

  const isSelected = selectedFile === node.path;
  const paddingLeft = level * 12 + 12;

  if (!node.is_dir) {
    return (
      <div
        className={`file-card ${isSelected ? "active" : ""}`}
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={() => openFile(node.path)}
      >
        <span className="file-card-icon">📄</span>
        <span className="file-card-name">
          {node.name.replace(/\.[^/.]+$/, "")}
        </span>
        <span className="file-card-extension">
          {node.name.includes(".") ? `.${node.name.split(".").pop()}` : ""}
        </span>
        <button
          className="file-card-delete"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`"${node.name}" silinsin mi?`)) {
              // Path is full absolute path from rust
              const separator = node.path.includes("/") ? "/" : "\\";
              const dirPath = node.path.substring(0, node.path.lastIndexOf(separator));
              deleteFile(dirPath, node.name, node.path);
            }
          }}
          title="Dosyayı sil"
        >
          🗑
        </button>
      </div>
    );
  }

  return (
    <div className="folder-node">
      <div
        className="folder-card"
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="folder-card-icon">{isOpen ? "📂" : "📁"}</span>
        <span className="folder-card-name" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {node.name}
        </span>
        
        <div className="folder-card-actions" onClick={(e) => e.stopPropagation()}>
           <button
             className="sidebar-btn-xs"
             onClick={() => { setIsOpen(true); setShowInputFor("file"); setInputValue(""); }}
             title="Yeni Dosya"
           >
             +📄
           </button>
           <button
             className="sidebar-btn-xs"
             onClick={() => { setIsOpen(true); setShowInputFor("dir"); setInputValue(""); }}
             title="Yeni Klasör"
           >
             +📁
           </button>
           <button
             className="file-card-delete"
             onClick={() => {
               if (window.confirm(`"${node.name}" klasörü silinsin mi?`)) {
                 const separator = node.path.includes("/") ? "/" : "\\";
                 const dirPath = node.path.substring(0, node.path.lastIndexOf(separator));
                 deleteDirectory(dirPath, node.name);
               }
             }}
             title="Klasörü sil"
           >
             🗑
           </button>
        </div>
      </div>

      {isOpen && showInputFor && (
        <div className="new-file-input-container" style={{ paddingLeft: `${paddingLeft + 12}px`, marginTop: "4px", marginBottom: "4px" }}>
          <input
            className="search-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={showInputFor === "file" ? "Dosya adı..." : "Klasör adı..."}
            autoFocus
            style={{ width: "120px", padding: "4px 8px", fontSize: "12px" }}
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
            className="sidebar-btn sidebar-btn-small"
            style={{ padding: "4px 6px" }}
            onClick={() => {
              if (inputValue.trim()) {
                if (showInputFor === "file") createFile(node.path, inputValue.trim());
                else createDirectory(node.path, inputValue.trim());
                setShowInputFor(null);
                setInputValue("");
              }
            }}
          >
            ✓
          </button>
          <button
            className="sidebar-btn sidebar-btn-small sidebar-btn-cancel"
            style={{ padding: "4px 6px" }}
            onClick={() => {
              setShowInputFor(null);
              setInputValue("");
            }}
          >
            ✗
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
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const Sidebar = ({
  path,
  setPath,
  files,
  selectedFile,
  getFiles,
  openFile,
  createFile,
  deleteFile,
  createDirectory,
  deleteDirectory,
  showNewFileInput,
  setShowNewFileInput,
  newFileName,
  setNewFileName,
}: SidebarProps) => {
  return (
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
          Çalışma Alanını Aç
        </button>

        {files.length > 0 && (
          <div className="sidebar-file-actions" style={{ display: "flex", gap: "4px", width: "100%" }}>
            {showNewFileInput ? (
              <div className="new-file-input-container">
                <input
                  className="search-input"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="Dosya veya Klasör..."
                  autoFocus
                  onKeyDown={(e) => {
                     // Default enter creates file at root for backwards compability and quick workflow.
                     // It is better to use the specific folder action buttons.
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
                  className="sidebar-btn sidebar-btn-small"
                  title="Dosya Oluştur"
                  onClick={() => {
                    if (newFileName.trim()) {
                      createFile(path, newFileName);
                      setNewFileName("");
                      setShowNewFileInput(false);
                    }
                  }}
                >
                  📝
                </button>
                 <button
                  className="sidebar-btn sidebar-btn-small"
                  title="Klasör Oluştur"
                  onClick={() => {
                    if (newFileName.trim()) {
                      createDirectory(path, newFileName);
                      setNewFileName("");
                      setShowNewFileInput(false);
                    }
                  }}
                >
                  📁
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
                style={{ flex: 1 }}
                onClick={() => setShowNewFileInput(true)}
              >
                + Yeni
              </button>
            )}
          </div>
        )}
      </div>

      {/* File list (Root level nodes) */}
      <div className="app-sidebar-content">
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
          />
        ))}
      </div>
    </aside>
  );
};
