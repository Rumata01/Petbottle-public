pub mod block; //Block veri yapisi
pub mod commands;
pub mod parser; // Markdown <--> Block donusumleri
pub mod state; // Document state yonetimi tauri komutlari

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::new())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_files,
            commands::get_default_path,
            commands::read_file_content,
            commands::save_file_content,
            commands::create_file,
            commands::delete_file,
            commands::create_directory,
            commands::delete_directory,
            commands::open_document,
            commands::close_document,
            commands::save_document,
            commands::get_blocks,
            commands::update_block,
            commands::add_block,
            commands::delete_block,
            commands::move_block,
            commands::change_block_type,
            commands::decrease_depth,
            commands::toggle_collapse,
            commands::undo,
            commands::redo,
            commands::save_content_snapshot,
            commands::check_path_exists,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri uygulamasi baslatilirken hata olustu");
}

#[cfg(test)]
mod tests {
    use crate::block::Block;
    use crate::parser::{parse_markdown, serialize_blocks};

    #[test]
    fn test_full_round_trip() {
        let markdown = "# Baslik \n\nParagraf metni.\n\n- Liste 1\n- Liste 2\n";

        let doc = parse_markdown(markdown);
        let result = serialize_blocks(&doc.children);

        assert!(result.contains("# Baslik"));
        assert!(result.contains("Paragraf"));
        assert!(result.contains("- Liste 1"));
    }

    #[test]
    fn test_block_creation() {
        let block = Block::paragraph("Test");
        assert!(!block.id.is_empty());
    }
}
