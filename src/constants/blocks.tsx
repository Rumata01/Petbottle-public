
import { Type, Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, Quote, Code, Minus, MessageSquare, ChevronRight } from "lucide-react";
import { BlockTypeOption } from "../types";

export const BLOCK_TYPES: BlockTypeOption[] = [
  // Temel
  { type: "paragraph", label: "Paragraf", icon: <Type size={16} />, description: "Düz metin" },
  { type: "heading", label: "Başlık 1", icon: <Heading1 size={16} />, depth: 1, description: "Büyük başlık" },
  { type: "heading", label: "Başlık 2", icon: <Heading2 size={16} />, depth: 2, description: "Orta başlık" },
  { type: "heading", label: "Başlık 3", icon: <Heading3 size={16} />, depth: 3, description: "Küçük başlık" },
  // Listeler
  { type: "bullet-list", label: "Liste", icon: <List size={16} />, description: "Madde işaretli liste" },
  { type: "numbered-list", label: "Numaralı Liste", icon: <ListOrdered size={16} />, description: "Sıralı liste" },
  { type: "checkbox", label: "Yapılacak", icon: <CheckSquare size={16} />, description: "Kontrol listesi" },
  // Icerik
  { type: "quote", label: "Alıntı", icon: <Quote size={16} />, description: "Alıntı bloğu" },
  { type: "code", label: "Kod Bloğu", icon: <Code size={16} />, description: "Kod parçacığı" },
  { type: "divider", label: "Ayraç", icon: <Minus size={16} />, description: "Yatay çizgi" },
  // Ozel
  { type: "callout", label: "Bilgi Kutusu", icon: <MessageSquare size={16} />, description: "Vurgulu bilgi" },
  { type: "toggle", label: "Açılır Blok", icon: <ChevronRight size={16} />, description: "Genişletilebilir içerik" },
];
