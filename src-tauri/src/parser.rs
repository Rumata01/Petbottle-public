use crate::block::{Block, BlockType, Document};

// pulldown_cmark: Rust'in pop parser kutuphanesi
// Event tabanli calisir
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};

// Parse
//React tarafindaki parseMarkDown() func karsiligi

// How work?
/*
1- pulldown_cmark, markdown'i "event"lere ayirir
2- Her event'i isleyip uygun Block'a ceviririz
3- Nested yapilar icin stack (yigin) kullaniliriz
*/

pub fn parse_markdown(content: &str) -> Document {
    // Parser Ayarlari

    // Options: hangi markdown ozelliklerinin aktif olacagini belirler
    // - ENABLE_TABLES: Tablo destegi
    // - ENABLE_STRIKETHROUGH: Ustu cizgili metin (~~metin~~)
    // - ENABLE_TASKLISTS: Checkbox listeler (- [ ] gorev )

    let options =
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS;

    // Parser olustur
    let parser = Parser::new_ext(content, options);

    // Sonuc bloklar
    let mut blocks: Vec<Block> = Vec::new();

    // Ic ice yapilar icin yigin (stack)
    // Ornek: Liste icinde liste oldugunda kullanilir
    let mut stack: Vec<Block> = Vec::new();

    // Mevcut metin biriktirici
    // Birden fazla Text event'i birlestirmek icin
    let mut current_text = String::new();

    //Mevcut blok turu (None = henuz blok baslamadi)
    let mut current_block_type: Option<BlockType> = None;

    // Baslik seviyesi (heading icin)
    let mut current_heading_level: Option<u8> = None;

    //Kod blogu icinde miyiz?
    let mut in_code_block = false;

    // Kod blogu dil bilgisi (ornegin: "rust", "javascript")
    let mut current_info_string: Option<String> = None;

    //Event isleme

    for event in parser {
        match event {
            // Baslangic eventleri (Start)
            Event::Start(tag) => {
                match tag {
                    //baslik
                    Tag::Heading { level, .. } => {
                        current_block_type = Some(BlockType::Heading);
                        current_heading_level = Some(heading_level_to_u8(level));
                    }
                    // paragraph
                    Tag::Paragraph => {
                        // Eger liste icinde degilsek paragraf baslat
                        if current_block_type.is_none() {
                            current_block_type = Some(BlockType::Paragraph);
                        }
                    }

                    // Listeler
                    Tag::List(ordered) => {
                        if ordered.is_some() {
                            current_block_type = Some(BlockType::NumberedList);
                        } else {
                            current_block_type = Some(BlockType::BulletList);
                        }
                    }

                    //Liste elemanin baslangici
                    Tag::Item => {
                        // Mevcut blogun yanina al (nested icin)
                        if let Some(block_type) = current_block_type.take() {
                            let block = Block::new(block_type, &current_text.trim());
                            if !stack.is_empty() {
                                //Ic ice liste elemani
                                stack.push(block);
                            }
                            current_text.clear();
                        }
                    }

                    // Alinti baslangici (>)
                    Tag::BlockQuote => {
                        current_block_type = Some(BlockType::Quote);
                    }

                    //Kod Blogu baslangici (```)
                    Tag::CodeBlock(kind) => {
                        current_block_type = Some(BlockType::Code);
                        in_code_block = true;
                        // Dil bilgisini al (```rust veya ```javascript gibi)
                        current_info_string = match kind {
                            pulldown_cmark::CodeBlockKind::Fenced(info) => {
                                let info_str = info.trim();
                                if info_str.is_empty() {
                                    None
                                } else {
                                    Some(info_str.to_string())
                                }
                            }
                            pulldown_cmark::CodeBlockKind::Indented => None,
                        };
                    }

                    // Digerleri 'ignore' for now
                    _ => {}
                }
            }

            // Bitis eventleri
            Event::End(tag_end) => {
                match tag_end {
                    // Baslik bitisi
                    TagEnd::Heading(_) => {
                        if let Some(level) = current_heading_level.take() {
                            let block = Block::heading(level, current_text.trim());
                            blocks.push(block);
                            current_text.clear();
                            current_block_type = None;
                        }
                    }

                    // Paragraf Bitisi
                    TagEnd::Paragraph => {
                        if current_block_type == Some(BlockType::Paragraph) {
                            let text = current_text.trim();
                            if !text.is_empty() {
                                blocks.push(Block::paragraph(text));
                            }
                            current_text.clear();
                            current_block_type = None;
                        }
                    }

                    // Liste elemani bitisi
                    TagEnd::Item => {
                        let text = current_text.trim().to_string();
                        current_text.clear();

                        // Blok turune gore olustur
                        let block_type =
                            current_block_type.clone().unwrap_or(BlockType::BulletList);

                        let block = Block::new(block_type, &text);
                        blocks.push(block);
                    }

                    // Liste Bitisi
                    TagEnd::List(_) => {
                        current_block_type = None;
                    }

                    //Alinti Bitisi
                    TagEnd::BlockQuote => {
                        let block = Block::new(BlockType::Quote, current_text.trim());
                        blocks.push(block);
                        current_text.clear();
                        current_block_type = None;
                    }

                    // kod Blogunun Bitisi
                    TagEnd::CodeBlock => {
                        let block =
                            Block::code(current_text.trim_end(), current_info_string.as_deref());
                        blocks.push(block);
                        current_text.clear();
                        current_block_type = None;
                        in_code_block = false;
                        current_info_string = None;
                    }
                    _ => {}
                }
            }

            // metin
            Event::Text(text) => {
                current_text.push_str(&text);
            }

            //Kod Event
            Event::Code(code) => {
                //Inline code: `kod` seklinde
                current_text.push('`');
                current_text.push_str(&code);
                current_text.push('`');
            }

            // Yatay Cizgi
            Event::Rule => {
                blocks.push(Block::new(BlockType::Divider, ""));
            }

            // Sert satir sonu
            Event::SoftBreak | Event::HardBreak => {
                // Kod blogu icindeki satir sonlarini koru
                if in_code_block {
                    current_text.push('\n');
                } else {
                    current_text.push(' ');
                }
            }

            // Diger eventler simdilik ignore
            _ => {}
        }
    }
    // kalan son metin varsa paragraf olarak ekle
    if !current_text.trim().is_empty() {
        blocks.push(Block::paragraph(current_text.trim()));
    }

    // Bos dokuman icin en az bir blok olmali
    if blocks.is_empty() {
        blocks.push(Block::empty());
    }

    Document::from_blocks(blocks)
}

// Block -> Markdown Donusumu Serialize
// React te serialize() func karsiligi

// Recursive
// kendi kendini cagirir (children)

pub fn serialize_blocks(blocks: &[Block]) -> String {
    serialize_blocks_with_indent(blocks, 0)
}

// Belirli bir girinti seviyesiyle serialize et
// indent_level: Kac seviye iceride oldugumuzu gosterir (nested lists icin)
fn serialize_blocks_with_indent(blocks: &[Block], indent_level: usize) -> String {
    let mut result = String::new();

    //Girinti boslugu (her seviye icin 2 bosluk)
    let indent = "  ".repeat(indent_level);

    for block in blocks {
        let line = match block.block_type {
            // Baslik (# ## ###)
            // Basliklar girinti almaz (md rule)
            BlockType::Heading => {
                let level = block.depth.unwrap_or(1);
                let hashes = "#".repeat(level as usize);
                format!("{} {}\n", hashes, block.content)
            }

            // paragraf
            // paragraftan sonra bos satir birak (md rule)
            BlockType::Paragraph => {
                format!("{}{}\n\n", indent, block.content)
            }

            // Madde Isaretli Liste (-)
            BlockType::BulletList => {
                format!("{}- {}\n", indent, block.content)
            }

            //Numarali Liste
            BlockType::NumberedList => {
                format!("{}1. {}\n", indent, block.content)
            }

            //CheckBox(- [ ])
            BlockType::Checkbox => {
                format!("{}- [ ] {}\n", indent, block.content)
            }

            // Alinti (>)
            BlockType::Quote => {
                format!("{}>{}\n", indent, block.content)
            }

            // Yatay cizgi (---)
            BlockType::Divider => {
                format!("---\n")
            }

            // Callout (> 💡)
            BlockType::Callout => {
                format!("{}>  {}\n", indent, block.content)
            }

            // Acilir Blok (<details>)
            BlockType::Toggle => {
                format!(
                    "<details>\n{}<summary>{}</summary>\n{}</details>\n",
                    indent, block.content, indent
                )
            }

            // Kod Blogu (```)
            BlockType::Code => {
                let lang = block.info_string.as_deref().unwrap_or("");
                format!("```{}\n{}{}\n```\n", lang, indent, block.content)
            }
        };

        result.push_str(&line);

        if let Some(children) = &block.children {
            if !children.is_empty() {
                result.push_str(&serialize_blocks_with_indent(children, indent_level + 1));
            }
        }
    }

    result
}

// yardimci func.
//headinglevel enum
fn heading_level_to_u8(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

//Round-Trip Fonksiyonu
pub fn round_trip(markdown: &str) -> String {
    let document = parse_markdown(markdown);
    serialize_blocks(&document.children)
}

// testler
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_heading() {
        let markdown = " # Ana Baslik\n\n## Alt Baslik";
        let doc = parse_markdown(markdown);

        assert_eq!(doc.children.len(), 2);
        assert_eq!(doc.children[0].block_type, BlockType::Heading);
        assert_eq!(doc.children[0].depth, Some(1));
        assert_eq!(doc.children[0].content, "Ana Baslik");
    }
    #[test]
    fn test_parse_paragraph() {
        let markdown = "Bu bir paragraf.\n\nBu da başka bir paragraf.";
        let doc = parse_markdown(markdown);

        assert_eq!(doc.children.len(), 2);
        assert_eq!(doc.children[0].block_type, BlockType::Paragraph);
    }

    #[test]
    fn test_parse_bullet_list() {
        let markdown = "- Madde 1\n- Madde 2\n- Madde 3";
        let doc = parse_markdown(markdown);

        assert_eq!(doc.children.len(), 3);
        assert_eq!(doc.children[0].block_type, BlockType::BulletList);
        assert_eq!(doc.children[0].content, "Madde 1");
    }

    #[test]
    fn test_serialize_heading() {
        let blocks = vec![Block::heading(1, "Başlık 1"), Block::heading(2, "Başlık 2")];

        let markdown = serialize_blocks(&blocks);
        assert!(markdown.contains("# Başlık 1"));
        assert!(markdown.contains("## Başlık 2"));
    }

    #[test]
    fn test_serialize_list() {
        let blocks = vec![Block::bullet_list("Madde 1"), Block::bullet_list("Madde 2")];

        let markdown = serialize_blocks(&blocks);
        assert!(markdown.contains("- Madde 1"));
        assert!(markdown.contains("- Madde 2"));
    }

    #[test]
    fn test_round_trip_simple() {
        let original = "# Başlık\n\nBu bir paragraf.\n\n- Liste 1\n- Liste 2\n";
        let result = round_trip(original);

        // Temel yapı korunmalı
        assert!(result.contains("# Başlık"));
        assert!(result.contains("paragraf"));
        assert!(result.contains("- Liste 1"));
    }
}
