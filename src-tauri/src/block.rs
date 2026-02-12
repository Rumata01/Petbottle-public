use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BlockType {
    //Temel blok turleri
    Paragraph,
    Heading,

    //Liste Turleri
    BulletList,
    NumberedList,
    Checkbox,

    //Icerik blocklari
    Quote,
    Code,
    Divider,

    //Ozel bloklar
    Callout,
    Toggle,
}

// Block Struct

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    // UUID formati
    // Her blogun essiz bir id si olmali
    pub id: String,

    //Blogun turu
    #[serde(rename = "type")]
    pub block_type: BlockType,

    // Blogun icerigi
    pub content: String,

    // Baslik seviyesi
    // Option -> !heading = none
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depth: Option<u8>,

    // Kod blogu icin dil (ornegin: "rust", "javascript")
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "infoString")]
    pub info_string: Option<String>,

    //nested blocks
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<Block>>,

    //Toggle blocklari icin acik mi kapali mi
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "isCollapsed")]
    pub is_collapsed: Option<bool>,
}

//Block implementation

impl Block {
    //Yeni blok olusturma (Constructor)

    pub fn new(block_type: BlockType, content: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            block_type,
            content: content.to_string(),
            depth: None,
            info_string: None,
            children: None,
            is_collapsed: None,
        }
    }

    //Baslik olusturma
    pub fn heading(level: u8, content: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            block_type: BlockType::Heading,
            content: content.to_string(),
            depth: Some(level),
            info_string: None,
            children: None,
            is_collapsed: None,
        }
    }

    // Kod blogu olusturma (dil bilgisi ile)
    pub fn code(content: &str, language: Option<&str>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            block_type: BlockType::Code,
            content: content.to_string(),
            depth: None,
            info_string: language.map(|s| s.to_string()),
            children: None,
            is_collapsed: None,
        }
    }
    //paragraf blogu olusturma
    pub fn paragraph(content: &str) -> Self {
        Self::new(BlockType::Paragraph, content)
    }

    // Blok Olusturma "Enter"
    pub fn empty() -> Self {
        Self::new(BlockType::Paragraph, "")
    }

    // Belirli turde bos blok olusturma (liste devami icin)
    pub fn empty_with_type(block_type: BlockType) -> Self {
        Self::new(block_type, "")
    }

    //Liste Elemani olusturma
    pub fn bullet_list(content: &str) -> Self {
        Self::new(BlockType::BulletList, content)
    }

    //Child (Alt Blok ) Ekleme
    pub fn add_child(&mut self, child: Block) {
        // Eger children None ise , yeni Vec olustur
        // Degilse mevcut Vec'e ekle
        match &mut self.children {
            Some(children) => children.push(child),
            None => self.children = Some(vec![child]),
        }
    }
    // kontrol (children var mi)
    pub fn has_children(&self) -> bool {
        self.children.as_ref().map_or(false, |c| !c.is_empty())
    }
}

// Default Trait
// cagrilidiginda paragraf donecek
impl Default for Block {
    fn default() -> Self {
        Self::empty()
    }
}

// AST
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    // Documents tum blocklari
    pub children: Vec<Block>,
}
impl Document {
    // Yeni bos dokuman
    pub fn new() -> Self {
        Self {
            children: Vec::new(),
        }
    }

    // tek bloklu document
    pub fn with_block(block: Block) -> Self {
        Self {
            children: vec![block],
        }
    }

    // Bloklardan document olustur
    pub fn from_blocks(blocks: Vec<Block>) -> Self {
        Self { children: blocks }
    }
}

impl Default for Document {
    fn default() -> Self {
        Self::new()
    }
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_block_creation() {
        let block = Block::paragraph("Test Icerik");

        assert_eq!(block.block_type, BlockType::Paragraph);
        assert_eq!(block.content, "Test Icerik");
        assert!(!block.id.is_empty()); // Id bos olamaz
    }

    #[test]
    fn test_heading_creation() {
        let heading = Block::heading(2, "Alt Baslik");

        assert_eq!(heading.block_type, BlockType::Heading);
        assert_eq!(heading.depth, Some(2));
        assert_eq!(heading.content, "Alt Baslik");
    }

    #[test]
    fn test_add_child() {
        let mut parent = Block::bullet_list("Parent");
        parent.add_child(Block::bullet_list("Child 1"));
        parent.add_child(Block::bullet_list("Child 2"));

        assert!(parent.has_children());
        assert_eq!(parent.children.as_ref().unwrap().len(), 2);
    }

    #[test]
    fn test_json_serialization() {
        let block = Block::paragraph("Test");
        let json = serde_json::to_string(&block).unwrap();

        //JSON' da type: paragraph olmali '!(block_type)'
        assert!(json.contains("\"type\":\"paragraph\""));
    }
}
