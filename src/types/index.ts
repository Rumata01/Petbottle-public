import React from "react";

export interface Block {
  id: string;
  type: string;       // Rust: BlockType enum (kebab-case)
  content: string;
  depth?: number;     // Heading seviyesi (1-6)
  infoString?: string; // Kod bloğu için dil 
  children?: Block[]; // Nested bloklar
  isCollapsed?: boolean;
  isChecked?: boolean; // checkbox
}

export interface BlockTypeOption {
  type: string;
  label: string;
  icon: React.ReactNode;
  depth?: number;
  description?: string;
}

export type ThemeName = "light" | "dark" | "forest" | "ocean" | "sunset";

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

export type DropPosition = "above" | "below" | "right" | "left";

export interface DropIndicatorState {
  targetId: string;
  position: DropPosition;
}
