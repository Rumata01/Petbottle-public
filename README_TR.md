# PetBottle: Yüksek Performanslı, Yerel-Öncelikli Kişisel Bilgi Yönetim Sistemi

[English Version](README.md)

## Genel Bakış

PetBottle; yüksek performanslı not alma ve doküman organizasyonu için tasarlanmış, yerel-öncelikli (local-first) gelişmiş bir kişisel bilgi yönetim (PKM) uygulamasıdır. Güçlü bir Rust tabanlı arka uç (backend) ve modern React ön uç (frontend) ile Tauri çerçevesi üzerine inşa edilen PetBottle, blok tabanlı düzenleme esnekliğini yerel markdown depolama güvenliğiyle birleştirir.

Sektör lideri üretkenlik araçlarından ilham alan PetBottle, dijital bilgi yönetiminde hibrit bir yaklaşım sunar. Blok düzeyinde içerik manipülasyonuna, sorunsuz markdown entegrasyonuna ve hız ile veri sahipliğini önceliklendiren premium bir kullanıcı deneyimine odaklanır.

## Temel Özellikler

- **Blok Tabanlı Mimari**: İçeriği blok düzeyinde yöneten, doküman öğelerinin hassas kontrolüne ve yeniden sıralanmasına olanak tanıyan birleşik sistem.
- **Yerel-Öncelikli Depolama**: Tüm veriler kullanıcının makinesinde yerel olarak saklanır; maksimum gizlilik, güvenlik ve çevrimdışı erişilebilirlik sağlanır.
- **Gelişmiş Markdown Entegrasyonu**: Sağlam bir Rust backend tarafından desteklenen yüksek performanslı markdown ayrıştırma (parsing) ve serileştirme.
- **Etkileşimli Taslak Sistemi**: Başlıklar, kontrol listeleri, kod blokları, bilgi kutuları ve iç içe geçmiş açılır menüler dahil olmak üzere birden fazla içerik türünü destekleyen gerçek zamanlı taslak oluşturma.
- **Dinamik Tema Motoru**: Farklı aydınlatma ortamları için optimize edilmiş birden fazla premium görsel tema (Açık, Koyu, Orman, Okyanus, Gün Batımı) desteği.
- **Sezgisel Navigasyon ve Komut Sistemi**: Blok türü seçimi ve doküman yapılandırması için hızlı erişim komut paneli (`/` tuşu ile erişilir).
- **Güvenli Mimari**: Ön uçta temizleme için DOMPurify uygulaması ve arka uçta iş parçacığı güvenli (thread-safe) durum yönetim sistemi.

## Teknik Mimari

PetBottle; hafif ve özellik açısından zengin bir masaüstü deneyimi sunmak için modern, platformlar arası bir mimari kullanır.

### Temel Teknolojiler

- **Ön Uç Çekirdeği**: React 19 / TypeScript 5.8
- **Masaüstü Çerçevesi**: Tauri 2 (Platformlar arası masaüstü uygulaması)
- **Arka Uç Dili**: Rust 2021 Sürümü
- **Derleme Araçları**: Vite 7
- **Stil Sistemi**: Özel tasarım Thema Kütüphanesi (CSS3)

### Teknik Yığın Detayları

#### Ön Uç Alt Sistemi
- **@tauri-apps/api**: JavaScript ve Rust arasındaki IPC köprüsü.
- **@dnd-kit**: Blok yeniden sıralama için performans odaklı sürükle ve bırak sistemi.
- **DOMPurify**: Endüstriyel düzeyde HTML temizleme.
- **React Router**: Gelişmiş istemci taraflı yönlendirme.
- **Unified & Remark**: Güçlü markdown işleme ekosistemi.

#### Arka Uç Alt Sistemi (Rust)
- **pulldown-cmark**: Standartlara uygun CommonMark ayrıştırma.
- **parking_lot**: Durum yönetimi için yüksek performanslı, iş parçacığı güvenli senkronizasyon araçları.
- **uuid**: Kriptografik olarak güvenli blok tanımlama.
- **serde/serde_json**: IPC iletişimi için verimli veri serileştirme.
- **dirs**: İşletim sistemi standartlarında yerel depolama yolu çözünürlüğü.

## Kurulum ve Geliştirme

### Ön Koşullar
- Node.js (Güncel LTS önerilir)
- Rust Araç Zinciri (Stabil)
- İşletim sisteminiz için Tauri sistem gereksinimleri

### Geliştirme Akışı
1. Depoyu klonlayın ve proje dizinine gidin.
2. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```
3. Geliştirme ortamını başlatın:
   ```bash
   npm run tauri dev
   ```

### Üretim Derlemesi
Üretime hazır bir uygulama paketi oluşturmak için:
```bash
npm run tauri build
```

## Güvenlik ve Bakım

PetBottle, "Tasarım Yoluyla Gizlilik" (Privacy by Design) felsefesiyle tasarlanmıştır. Tüm veri işleme yerel makinede gerçekleşir; harici izleme veya veri telemetrisi uygulanmaz. Güvenlik endişeleri veya bakım talepleri için lütfen kök dizindeki `SECURITY.md` dosyasına bakın.

## Lisans

Bu proje MIT Lisansı şartları altında lisanslanmıştır. Detaylar için `LICENSE` dosyasına bakınız.
