// tauri komutlari (React ile Iletisim)
// React frontend' in cagirabilecegi Rust fonksiyonlarini tanimlar
//tauri' nin IPC (Inter-Process Communication) mekanizmasini kullanir.

/* Nasil calisir

1- React: invoke("komut adi", {parametreler})
2- Tauri: Rust fonkisyonunu cagirir
3- Rust: islem yapar, sonucu dondurur
4- Reack: Sonucu alir ve UI' yi gunceller

*/

use crate::block::{Block, BlockType};
use crate::parser::{parse_markdown, serialize_blocks};
use crate::state::DocumentManager;

// parking_lot: Thread-safe mutex (standart Mutex' den daha performansli)
use parking_lot::Mutex;

// Tauri State yonetimi icin
use tauri::State;

// Standart Libraries

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

//Global State
pub struct AppState {
    // Dokuman yoneticisi
    pub manager: Mutex<DocumentManager>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            manager: Mutex::new(DocumentManager::new()),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

// Guvenlik: Izin verilen dizin kontrolu
fn is_path_allowed(path: &PathBuf) -> Result<(), String> {
    // Linux/macOS: sistem dizinleri yasak
    #[cfg(not(target_os = "windows"))]
    {
        let forbidden_prefixes = [
            "/etc", "/root", "/var", "/usr", "/bin", "/sbin", "/boot",
            "/dev", "/proc", "/sys", "/lib", "/lib64", "/opt",
            "/srv", "/run", "/snap",
        ];
        for prefix in &forbidden_prefixes {
            if path.starts_with(prefix) {
                return Err("Erişim Reddedildi: Sistem dizinlerine erişim yasaktır.".to_string());
            }
        }
    }

    // Kullanıcı klasörlerinden biri altında mı?
    let safe_roots: Vec<std::path::PathBuf> = [
        dirs::home_dir(),
        dirs::document_dir(),
        dirs::desktop_dir(),
        dirs::download_dir(),
        dirs::public_dir(),
        dirs::picture_dir(),
        dirs::video_dir(),
    ]
    .into_iter()
    .flatten()
    // Her güvenli kökü de canonicalize et (Windows symlink/OneDrive sorunu için)
    .filter_map(|p| p.canonicalize().ok())
    .collect();

    for root in &safe_roots {
        if path.starts_with(root) {
            return Ok(());
        }
    }

    // Windows'ta USERPROFILE/HOMEDRIVE fallback
    #[cfg(target_os = "windows")]
    {
        if let Ok(user_profile) = std::env::var("USERPROFILE") {
            let up = PathBuf::from(&user_profile);
            if path.starts_with(&up) {
                return Ok(());
            }
            if let Ok(canonical_up) = up.canonicalize() {
                if path.starts_with(&canonical_up) {
                    return Ok(());
                }
            }
        }
        // HOMEDRIVE + HOMEPATH
        if let (Ok(drive), Ok(homepath)) = (
            std::env::var("HOMEDRIVE"),
            std::env::var("HOMEPATH"),
        ) {
            let home = PathBuf::from(format!("{}{}", drive, homepath));
            if path.starts_with(&home) {
                return Ok(());
            }
        }
    }

    Err("Erişim izni yok: Sadece kullanıcı klasörleri altında çalışabilirsiniz.".to_string())
}

// Dosya uzantisini kontrol
fn validate_extension(path: &PathBuf) -> Result<(), String> {
    match path.extension() {
        Some(ext) if ext == "md" => Ok(()),
        Some(_) => Err("Sadece markdown (.md) dosyalari desteklenir".to_string()),
        None => Err("Dosya Uzantisi Belirtilmeli (.md)".to_string()),
    }
}

// Dosya Islemleri

#[derive(Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String, // relative to the base directory, or absolute (for simplicity we will use absolute)
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

// Helper: Rekürsif olarak dosya ağacını oluşturur
fn build_file_tree(dir: &Path, allowed_base: &Path) -> Result<Vec<FileNode>, String> {
    let mut nodes = Vec::new();

    let entries = fs::read_dir(dir).map_err(|_| "Dizin okunamadi".to_string())?;

    for entry in entries {
        let entry = entry.map_err(|_| "Dosya Listelenemedi".to_string())?;
        let path = entry.path();
        
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Hidden files filter
        if file_name.starts_with('.') || file_name == ".." {
            continue;
        }

        if path.is_dir() {
            let children = build_file_tree(&path, allowed_base)?;
            nodes.push(FileNode {
                name: file_name,
                path: path.to_string_lossy().to_string(),
                is_dir: true,
                children: Some(children),
            });
        } else if path.is_file() {
            // Sadece .md uzantılı dosyaları ekle
            if file_name.ends_with(".md") {
                nodes.push(FileNode {
                    name: file_name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: false,
                    children: None,
                });
            }
        }
    }

    // Klasörler önce, sonra dosyalar, alfabetik sıralı
    nodes.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            if a.is_dir {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        } else {
            a.name.cmp(&b.name)
        }
    });

    Ok(nodes)
}

//Klasordeki dosyalari listele (Nested)
#[tauri::command]
pub fn list_files(path: String) -> Result<Vec<FileNode>, String> {
    //Bos path kontrolu
    if path.trim().is_empty() {
        return Err("Bir dizin yolu gir".to_string());
    }

    //Path'i normalize et
    let base_path = PathBuf::from(&path)
        .canonicalize()
        .map_err(|_| "Gecersiz dizin yolu".to_string())?;

    //Security Check
    is_path_allowed(&base_path)?;

    build_file_tree(&base_path, &base_path)
}

// Varsayilan Dizini olustur ve dondur
#[tauri::command]
pub fn get_default_path() -> Result<String, String> {
    let base_dir = dirs::document_dir().ok_or("Belgeler klasörü bulunamadı")?;

    let default_path = base_dir.join("PetBottle");

    if !default_path.exists() {
        fs::create_dir_all(&default_path)
            .map_err(|_| "Varsayilan klasor olusturulamadi".to_string())?;

        //Hosgeldin Dosyasi olustur
        let welcome_file = default_path.join("Hosgeldin.md");
        let welcome_content = "# PetBottle'a Hosgeldiniz!\n\nPetBottle, markdown tabanli modern bir not alma uygulamasidir. Notlarinizi bloklar halinde olusturun, duzenleyin ve yonetin.\n\n## Nasil Kullanilir?\n\nPetBottle'da her sey bloklar uzerinden calisir. Bir blogun icindeyken:\n\n- **Enter** tusuna basarak yeni blok olusturabilirsiniz\n- **/** (slash) tusuna basarak blok turunu degistirebilirsiniz\n- **Backspace** ile bos blogu silebilirsiniz\n\n## Blok Turleri\n\nCommand Panel (/) ile su bloklari olusturabilirsiniz:\n\n1. Basliklar (H1, H2, H3)\n2. Numarali Liste\n3. Madde Isareti Listesi\n4. Yapilacaklar Listesi\n5. Alinti Blogu\n6. Kod Blogu\n7. Acilir Blok (Toggle)\n8. Bilgi Kutusu (Callout)\n9. Ayrac (Divider)\n\n## Klavye Kisayollari\n\n- **Ctrl + S** - Kaydet\n- **Ctrl + Z** - Geri Al\n- **Ctrl + Y** - Ileri Al\n- **/** - Command Panel\n- **Enter** - Yeni blok\n- **Backspace** - Bos bloku sil\n\n## Temalar\n\nSol alt kosedeki tema degistirici ile farkli gorunumler arasinda gecis yapabilirsiniz: Light, Dark, Forest, Ocean ve Sunset.\n\n---\n\nIyi calismalar! Yeni notlar olusturmak icin sol paneli kullanabilirsiniz.";
        fs::write(&welcome_file, welcome_content).ok();
    }
    Ok(default_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn check_path_exists(path: String) -> bool {
    let path_buf = PathBuf::from(&path);

    // Sembolik linkleri ve ..'ları çözmek için önce canonicalize et
    if let Ok(canonical_path) = path_buf.canonicalize() {
        // Sonra izin verilen bir dizinde olup olmadığını kontrol et
        if is_path_allowed(&canonical_path).is_ok() {
            return canonical_path.exists();
        }
    }
    false
}
// Document Islemleri
// Dosya parse edilecek

// Document ID: sonraki islemler icin bu ID kullanilacak
#[tauri::command]
pub fn open_document(path: String, state: State<AppState>) -> Result<(String, Vec<Block>), String> {
    //Path dogrulama
    let file_path = PathBuf::from(&path)
        .canonicalize()
        .map_err(|_| "Gecersiz Dosya Yolu ".to_string())?;

    is_path_allowed(&file_path)?;
    validate_extension(&file_path)?;

    //Dosyayi Oku
    let content = fs::read_to_string(&file_path).map_err(|_| "Dosya okunamadi".to_string())?;

    // Markdown' i parse et (RUST Yapiyor )
    let document = parse_markdown(&content);
    let blocks = document.children.clone();

    //State'e ekle
    let mut manager = state.manager.lock();
    let doc_id = manager.open_document(&path, document.children);

    //(doc_id), bloklar) dondur
    Ok((doc_id, blocks))
}

// Take to Document Blocks
#[tauri::command]
pub fn get_blocks(doc_id: String, state: State<AppState>) -> Result<Vec<Block>, String> {
    let manager = state.manager.lock();

    manager
        .get_document(&doc_id)
        .map(|doc| doc.blocks.clone())
        .ok_or_else(|| "Dokuman bulunamadi".to_string())
}

// Blok Guncelle
#[tauri::command]
pub fn update_block(
    doc_id: String,
    block_id: String,
    content: String,
    state: State<AppState>,
) -> Result<(), String> {
    let mut manager = state.manager.lock();

    let doc = manager
        .get_document_mut(&doc_id)
        .ok_or_else(|| "Dokuman bulunamadi".to_string())?;

    if doc.update_block(&block_id, &content) {
        Ok(())
    } else {
        Err("Blok bulunamadi".to_string())
    }
}

// History'ye snapshot al
#[tauri::command]
pub fn save_content_snapshot(doc_id: String, state: State<AppState>) -> Result<(), String> {
    let mut manager = state.manager.lock();

    let doc = manager
        .get_document_mut(&doc_id)
        .ok_or_else(|| "Dokuman bulunamadi".to_string())?;

    doc.save_content_snapshot();
    Ok(())
}

// Yeni Blok Ekle

// Olusturulan yeni blok
#[tauri::command]
pub fn add_block(
    doc_id: String,
    after_id: String,
    exit_to_parent: bool,
    block_type: Option<String>,
    state: State<AppState>,
) -> Result<Block, String> {
    let mut manager = state.manager.lock();

    let doc = manager
        .get_document_mut(&doc_id)
        .ok_or_else(|| "Dokuman bulunamadi".to_string())?;

    // block_type string'ini BlockType enum'a cevir
    let bt = block_type.and_then(|t| match t.as_str() {
        "bullet-list" => Some(crate::block::BlockType::BulletList),
        "numbered-list" => Some(crate::block::BlockType::NumberedList),
        "checkbox" => Some(crate::block::BlockType::Checkbox),
        _ => None,
    });

    // RA bug: false positive, arguments are correct
    let new_block = doc.add_block(&after_id, exit_to_parent, bt);
    Ok(new_block)
}

// Toggle blogu ac/kapat
#[tauri::command]
pub fn toggle_collapse(
    doc_id: String,
    block_id: String,
    state: State<AppState>,
) -> Result<bool, String> {
    let mut manager = state.manager.lock();

    let doc = manager
        .get_document_mut(&doc_id)
        .ok_or_else(|| "Dokuman bulunamadi".to_string())?;

    doc.toggle_collapse(&block_id)
        .ok_or_else(|| "Blok bulunamadi".to_string())
}

// Checkbox blogunu isaretle/kaldir
#[tauri::command]
pub fn toggle_checkbox(
    doc_id: String,
    block_id: String,
    state: State<AppState>,
) -> Result<bool, String> {
    let mut manager = state.manager.lock();

    let doc = manager
        .get_document_mut(&doc_id)
        .ok_or_else(|| "Dokuman bulunamadi".to_string())?;

    doc.toggle_checkbox(&block_id)
        .ok_or_else(|| "Blok bulunamadi".to_string())
}

//Blok Sil
//Onceki blogun Id'si (focus icin)
#[tauri::command]
pub fn delete_block(
    doc_id: String,
    block_id: String,
    state: State<AppState>,
) -> Result<Option<String>, String> {
    let mut manager = state.manager.lock();

    let doc = manager
        .get_document_mut(&doc_id)
        .ok_or_else(|| "Dokuman bulunamadi".to_string())?;

    Ok(doc.delete_block(&block_id))
}

// Block (drag & drop)
#[tauri::command]
pub fn move_block(
    doc_id: String,
    block_id: String,
    target_id: String,
    as_child: bool,
    state: State<AppState>,
) -> Result<Vec<Block>, String> {
    let mut manager = state.manager.lock();

    let doc = manager
        .get_document_mut(&doc_id)
        .ok_or_else(|| "Dokuman bulunamadi".to_string())?;
    doc.move_block(&block_id, &target_id, as_child);
    Ok(doc.blocks.clone())
}

// Blok turu degistir (Command Panel'den)
#[tauri::command]
pub fn change_block_type(
    doc_id: String,
    block_id: String,
    new_type: String,
    depth: Option<u8>,
    state: State<AppState>,
) -> Result<(), String> {
    let mut manager = state.manager.lock();

    let doc = manager
        .get_document_mut(&doc_id)
        .ok_or_else(|| "Dokuman bulunamadi".to_string())?;

    // String'i BlockType'a cevir
    let block_type = match new_type.as_str() {
        "paragraph" => BlockType::Paragraph,
        "heading" => BlockType::Heading,
        "bullet-list" => BlockType::BulletList,
        "numbered-list" => BlockType::NumberedList,
        "checkbox" => BlockType::Checkbox,
        "quote" => BlockType::Quote,
        "code" => BlockType::Code,
        "divider" => BlockType::Divider,
        "callout" => BlockType::Callout,
        "toggle" => BlockType::Toggle,
        _ => return Err(format!("Bilinmeyen blok turu: {}", new_type)),
    };

    if doc.change_block_type(&block_id, block_type, depth) {
        Ok(())
    } else {
        Err("Blok bulunamadi".to_string())
    }
}

// Kod blogu dilini (infoString) guncelle
#[tauri::command]
pub fn update_info_string(
    doc_id: String,
    block_id: String,
    info_string: String,
    state: State<AppState>,
) -> Result<(), String> {
    let mut manager = state.manager.lock();

    let doc = manager
        .get_document_mut(&doc_id)
        .ok_or_else(|| "Dokuman bulunamadi".to_string())?;

    if doc.update_info_string(&block_id, info_string) {
        Ok(())
    } else {
        Err("Blok bulunamadi".to_string())
    }
}

// Blok depth azalt
#[tauri::command]
pub fn decrease_depth(
    doc_id: String,
    block_id: String,
    state: State<AppState>,
) -> Result<(), String> {
    let mut manager = state.manager.lock();

    let doc = manager
        .get_document_mut(&doc_id)
        .ok_or_else(|| "Dokuman bulunamadi".to_string())?;

    if doc.decrease_depth(&block_id) {
        Ok(())
    } else {
        Err("Blok bulunamadi".to_string())
    }
}

// Undo - Redo

//Ctrl+Z
#[tauri::command]
pub fn undo(doc_id: String, state: State<AppState>) -> Result<Option<Vec<Block>>, String> {
    let mut manager = state.manager.lock();

    let doc = manager
        .get_document_mut(&doc_id)
        .ok_or_else(|| "Dokuman bulunamadi".to_string())?;

    Ok(doc.undo())
}

// Ctrl+Y
#[tauri::command]
pub fn redo(doc_id: String, state: State<AppState>) -> Result<Option<Vec<Block>>, String> {
    let mut manager = state.manager.lock();
    let doc = manager
        .get_document_mut(&doc_id)
        .ok_or_else(|| "Dokuman bulunamadi".to_string())?;

    Ok(doc.redo())
}
// Kaydetme

//Dokumani Kaydet
#[tauri::command]
pub fn save_document(doc_id: String, state: State<AppState>) -> Result<(), String> {
    let mut manager = state.manager.lock();

    let doc = manager
        .get_document_mut(&doc_id)
        .ok_or_else(|| "Dokuman bulunamadi".to_string())?;

    // Degisiklik yoksa kaydetme
    if !doc.has_changes() {
        return Ok(());
    }

    // Bloklari Markdown'a serialize et (Rust yapiyor)
    let content = serialize_blocks(&doc.blocks);

    // Path dogrulama
    let file_path = PathBuf::from(&doc.file_path);
    let parent = file_path
        .parent()
        .ok_or_else(|| "Ust klasor bulunamadi".to_string())?;

    let canonical_parent = parent
        .canonicalize()
        .map_err(|_| "Gecersiz dizin yolu".to_string())?;

    is_path_allowed(&canonical_parent)?;

    //tam dosya yolu

    let full_path = canonical_parent.join(file_path.file_name().unwrap());

    //Dosyaya yaz
    let mut file = fs::File::create(&full_path).map_err(|_| "Dosya olusuturulamadi".to_string())?;

    file.write_all(content.as_bytes())
        .map_err(|_| "Dosya yazilamadi".to_string())?;

    //State'i Guncelle
    doc.mark_saved(&content);

    Ok(())
}

// Dokumani Kapat
#[tauri::command]
pub fn close_document(doc_id: String, state: State<AppState>) -> Result<bool, String> {
    let mut manager = state.manager.lock();
    Ok(manager.close_document(&doc_id))
}

// tek seferlik dosya okuma (Mevut API uyumu icin)

// Dosya icerigini okuma (parse etmeden ham metin)

#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    let file_path = PathBuf::from(&path)
        .canonicalize()
        .map_err(|_| "Gecersiz dosya yolu".to_string())?;

    is_path_allowed(&file_path)?;
    validate_extension(&file_path)?;

    fs::read_to_string(file_path).map_err(|_| "Dosya okunamadi".to_string())
}

// Dosya kaydetme (ham metin)
#[tauri::command]
pub fn save_file_content(path: String, content: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);

    // Dosya adında path traversal kontrolü
    let file_name = file_path
        .file_name()
        .ok_or_else(|| "Gecersiz dosya adi".to_string())?
        .to_string_lossy();
    if file_name.contains("..") || file_name.contains('\0') || file_name.contains('/') || file_name.contains('\\') {
        return Err("Dosya adında geçersiz karakterler var".to_string());
    }

    let parent = file_path
        .parent()
        .ok_or_else(|| "Ust klasor bulunamadi".to_string())?;

    let canonical_parent = parent
        .canonicalize()
        .map_err(|_| "Gecersiz dizin yolu".to_string())?;

    is_path_allowed(&canonical_parent)?;
    validate_extension(&file_path)?;

    let full_path = canonical_parent.join(file_path.file_name().unwrap());

    // Son yolun izin verilen dizinde olduğunu doğrula
    if !full_path.starts_with(&canonical_parent) {
        return Err("Dosya yolu izin verilen dizin dışında".to_string());
    }

    let mut file = fs::File::create(&full_path).map_err(|_| "Dosya olusuturulamadi".to_string())?;

    file.write_all(content.as_bytes())
        .map_err(|_| "Dosya yazilamadi".to_string())?;

    Ok(())
}

// Yeni dosya olustur
#[tauri::command]
pub fn create_file(directory: String, filename: String) -> Result<String, String> {
    let dir_path = PathBuf::from(&directory);

    // Dizin kontrolu
    let canonical_dir = dir_path
        .canonicalize()
        .map_err(|_| "Gecersiz dizin yolu".to_string())?;

    is_path_allowed(&canonical_dir)?;

    // Dosya adini temizle ve uzanti ekle
    let clean_name = filename.trim();
    if clean_name.is_empty() {
        return Err("Dosya adi bos olamaz".to_string());
    }

    // Path traversal koruması — dosya adında / veya .. olamaz
    if clean_name.contains('/') || clean_name.contains('\\') || clean_name.contains("..") || clean_name.contains('\0') {
        return Err("Dosya adında geçersiz karakterler var".to_string());
    }

    // .md uzantisi yoksa ekle
    let final_name = if clean_name.ends_with(".md") {
        clean_name.to_string()
    } else {
        format!("{}.md", clean_name)
    };

    let file_path = canonical_dir.join(&final_name);

    // Oluşturulan yolun hâlâ izin verilen dizinde olduğunu doğrula
    if !file_path.starts_with(&canonical_dir) {
        return Err("Dosya yolu izin verilen dizin dışında".to_string());
    }

    // Dosya zaten var mi?
    if file_path.exists() {
        return Err("Bu isimde bir dosya zaten mevcut".to_string());
    }

    // Bos dosya olustur
    let initial_content = format!("# {}\n\n", clean_name.replace(".md", ""));

    let mut file =
        fs::File::create(&file_path).map_err(|e| format!("Dosya olusturulamadi: {}", e))?;

    file.write_all(initial_content.as_bytes())
        .map_err(|e| format!("Dosya yazilamadi: {}", e))?;

    Ok(final_name)
}

// Dosya sil
#[tauri::command]
pub fn delete_file(directory: String, filename: String) -> Result<(), String> {
    let dir_path = PathBuf::from(&directory);

    // Dizin kontrolu
    let canonical_dir = dir_path
        .canonicalize()
        .map_err(|_| "Gecersiz dizin yolu".to_string())?;

    is_path_allowed(&canonical_dir)?;

    // Path traversal koruması — dosya adında / veya .. olamaz
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") || filename.contains('\0') {
        return Err("Dosya adında geçersiz karakterler var".to_string());
    }

    let file_path = canonical_dir.join(&filename);

    // Oluşturulan yolun hâlâ izin verilen dizinde olduğunu doğrula
    if !file_path.starts_with(&canonical_dir) {
        return Err("Dosya yolu izin verilen dizin dışında".to_string());
    }

    // Dosya var mi?
    if !file_path.exists() {
        return Err("Dosya bulunamadi".to_string());
    }

    // Uzanti kontrolu
    validate_extension(&file_path)?;

    // Dosyayi sil
    fs::remove_file(&file_path).map_err(|e| format!("Dosya silinemedi: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn rename_file(old_path: String, new_name: String) -> Result<(), String> {
    let old = PathBuf::from(&old_path)
        .canonicalize()
        .map_err(|_| "Gecersiz Dizin".to_string())?;

    is_path_allowed(&old)?;

    if !old.is_file() {
         return Err("Bu bir klasor".to_string());
    }

    let parent = old.parent().unwrap_or(Path::new(""));
    let mut new_path = parent.join(&new_name);

    if !new_name.ends_with(".md") && old.extension().map_or(false, |ext| ext == "md") {
        new_path.set_extension("md");
    }

    if new_path.exists() {
        return Err("Bu isimde bir dosya zaten var".to_string());
    }

    fs::rename(old, new_path).map_err(|e| e.to_string())?;

    Ok(())
}

// Klasör oluştur
#[tauri::command]
pub fn create_directory(directory: String, dirname: String) -> Result<String, String> {
    let dir_path = PathBuf::from(&directory);

    // Dizin kontrolu
    let canonical_dir = dir_path
        .canonicalize()
        .map_err(|_| "Gecersiz dizin yolu".to_string())?;

    is_path_allowed(&canonical_dir)?;

    let clean_name = dirname.trim();
    if clean_name.is_empty() {
        return Err("Klasör adı boş olamaz".to_string());
    }

    // Path traversal koruması
    if clean_name.contains('/') || clean_name.contains('\\') || clean_name.contains("..") || clean_name.contains('\0') {
        return Err("Klasör adında geçersiz karakterler var".to_string());
    }

    let new_dir_path = canonical_dir.join(&clean_name);

    if !new_dir_path.starts_with(&canonical_dir) {
        return Err("Klasör yolu izin verilen dizin dışında".to_string());
    }

    if new_dir_path.exists() {
        return Err("Bu isimde bir klasör veya dosya zaten mevcut".to_string());
    }

    fs::create_dir(&new_dir_path).map_err(|e| format!("Klasör oluşturulamadı: {}", e))?;

    Ok(clean_name.to_string())
}

// Klasör sil
#[tauri::command]
pub fn delete_directory(directory: String, dirname: String) -> Result<(), String> {
    let dir_path = PathBuf::from(&directory);

    // Dizin kontrolu
    let canonical_dir = dir_path
        .canonicalize()
        .map_err(|_| "Gecersiz dizin yolu".to_string())?;

    is_path_allowed(&canonical_dir)?;

    // Path traversal koruması
    if dirname.contains('/') || dirname.contains('\\') || dirname.contains("..") || dirname.contains('\0') {
        return Err("Klasör adında geçersiz karakterler var".to_string());
    }

    let target_dir_path = canonical_dir.join(&dirname);

    if !target_dir_path.starts_with(&canonical_dir) {
        return Err("Klasör yolu izin verilen dizin dışında".to_string());
    }

    if !target_dir_path.exists() || !target_dir_path.is_dir() {
        return Err("Klasör bulunamadı veya bir dizin değil".to_string());
    }

    fs::remove_dir_all(&target_dir_path).map_err(|e| format!("Klasör silinemedi: {}", e))?;

    Ok(())
}
