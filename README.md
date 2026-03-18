# PetBottle: High-Performance Local-First Personal Knowledge Management System

[Türkçe Versiyon](README_TR.md)

## Overview

PetBottle is a sophisticated, local-first personal knowledge management (PKM) application designed for high-performance note-taking and document organization. Built on the Tauri framework with a powerful Rust-based backend and a modern React frontend, PetBottle combines the flexibility of block-based editing with the security and privacy of local markdown storage.

Inspired by industry-leading productivity tools, PetBottle introduces a unique hybrid approach to managing digital knowledge. It focuses on block-level content manipulation, seamless markdown integration, and a premium user experience that prioritizes speed and data ownership.

## Key Features

- **Block-Based Architecture**: Unified system for managing content at the block level, allowing for granular control and reordering of document elements.
- **Local-First Storage**: All data is stored locally on the user's machine, ensuring maximum privacy, security, and offline availability.
- **Advanced Markdown Integration**: High-performance markdown parsing and serialization powered by a robust Rust backend.
- **Interactive Drafting System**: Real-time drafting with support for multiple content types, including headers, checklists, code blocks, callouts, and nested toggles.
- **Dynamic Theming Engine**: Support for multiple premium visual themes (Light, Dark, Forest, Ocean, Sunset) optimized for various lighting environments.
- **Intuitive Navigation & Command System**: A quick-access command panel (accessed via `/`) for efficient block type selection and document structuring.
- **Secure Architecture**: Implementation of DOMPurify for frontend sanitization and a thread-safe state management system in the backend.

## Technical Architecture

PetBottle leverages a modern, cross-platform architecture to deliver a desktop experience that is both lightweight and feature-rich.

### Core Technologies

- **Frontend Core**: React 19 / TypeScript 5.8
- **Desktop Framework**: Tauri 2 (Cross-platform Desktop Application)
- **Backend Language**: Rust 2021 Edition
- **Build Tooling**: Vite 7
- **Style System**: Custom-engineered Thema Library (CSS3)

### Technical Stack Detail

#### Frontend Subsystem
- **@tauri-apps/api**: IPC Bridge between JavaScript and Rust.
- **@dnd-kit**: Performance-optimized drag and drop system for block reordering.
- **DOMPurify**: Industrial-grade HTML sanitization.
- **React Router**: Advanced client-side routing.
- **Unified & Remark**: Robust markdown processing ecosystem.

#### Backend Subsystem (Rust)
- **pulldown-cmark**: Industrial-standard compliant CommonMark parsing.
- **parking_lot**: High-performance, thread-safe synchronization primitives for state management.
- **uuid**: Cryptographically secure block identification.
- **serde/serde_json**: Efficient data serialization for IPC communication.
- **dirs**: OS-standard path resolution for local storage management.

## Installation & Development

### Prerequisites
- Node.js (Latest LTS recommended)
- Rust Toolchain (Stable)
- System dependencies for Tauri (Refer to the Tauri documentation for your OS)

### Development Workflow
1. Clone the repository and navigate to the project directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Launch the development environment:
   ```bash
   npm run tauri dev
   ```

### Production Build
To generate a production-ready application bundle:
```bash
npm run tauri build
```

## Security & Maintenance

PetBottle is designed with a "Privacy by Design" philosophy. All data processing occurs on the local machine, and no external tracking or data telemetry is implemented. For security concerns or maintenance requests, please refer to the `SECURITY.md` file located in the root directory.

## License

This project is licensed under the terms of the MIT License. See the `LICENSE` file for full details.
