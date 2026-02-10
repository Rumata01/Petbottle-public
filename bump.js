const fs = require("fs");
const path = require("path");

const newVersion = process.argv[2];

if (!newVersion) {
  console.error(
    " Hata: Lütfen bir versiyon numarası girin. Örn: node bump.js 0.1.8",
  );
  process.exit(1);
}

const files = [
  "package.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
];

files.forEach((file) => {
  const filePath = path.join(__dirname, file);

  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, "utf8");

    if (file.endsWith(".toml")) {
      content = content.replace(
        /^version = ".*"/m,
        `version = "${newVersion}"`,
      );
    } else {
      const json = JSON.parse(content);
      if (file.includes("tauri.conf.json")) {
        json.package.version = newVersion;
      } else {
        json.version = newVersion;
      }
      content = JSON.stringify(json, null, 2);
    }

    fs.writeFileSync(filePath, content, "utf8");
    console.log(` Güncellendi: ${file} -> ${newVersion}`);
  } else {
    console.log(` Bulunamadı: ${file}`);
  }
});

console.log(`\n Tüm versiyonlar ${newVersion} olarak eşitlendi!`);
