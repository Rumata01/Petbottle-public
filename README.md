# Petbottle Yerel Not Tutma Uygulamasi

## Rust + Tauri + React

- Rust' i tercih etme sebebim hafif ve cok optimize calisiyor olmasidir.
- Tauri' yi tercih etme sebebim dagitim ve derleme acisindan cok hizli ve performansli calismasi
- React' i tercih etme sebebim de guncel olmasi ayrica yazmasi cok keyifli

### Temalar

- Temalari ve kutuphaneleri kendim yazdim ve projenin icine gomdum
- PetBottle yerel calisacagi icin internetten herhangi bir paket cekmesine gerek yok

### Surum Bilgisi

- Suan Betanin da altinda cok fazla hata ve bug var surekli guncelleme ve yenileme saglayacagim

### Uygulamanin Temel Ozellikleri

- Gunluk hayatta, okulda ve is yerinde not olmak icin kullandigimiz Notion ve Obsidian gibi uygulamalardan
  esinlenerek; blok yapisini ve yerelde markdown olarak dosyalari saklamak uzerinde kurulu AST( Abstract Syntax Tree ) algoritmasini kullanarak
  olusturdugum motora sahip.

 - Algoritmalar ve temel yapi, guvenlik dosyalarin uzanti kontrolu Rust ile saglaniyor.
 - On kontrol de React tarafindan Rust a iletiliyor, React de basit bir ust taramasi yapiliyor icerde de gelen veri komple soyunuyor.
 - Uygulama tamamen yerel de calisiyor ilk once guvenlik diyerek planladigim bir proje.

### Yapmayi Planladiklarim

- Mehmet Akif Ersoy Universitesi icin sunumunu yapip kabul edilirse sadece ' eduroam ' aginda ogrencilerin birbirlerine not paylasimi yapabilecegi ozel bir bolum de yapmak hedefindeyim.
- Temalar suan icin cok civik ve goz kanatan bir yapiya sahip ilereyen surecte daha kapsamli birden cok fonksiyonu ve class i icinde barindiran bir kutuphane yazmak da istiyorum.
