#!/bin/bash

# Ensure a version argument is provided
if [ -z "$1" ]; then
  echo "Usage: ./scripts/update-version.sh <version>"
  echo "Example: ./scripts/update-version.sh 0.1.15"
  exit 1
fi

NEW_VERSION=$1
echo "Updating version to $NEW_VERSION across the project..."

# 1. Update package.json
sed -i -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$NEW_VERSION\"/" package.json
echo "Updated package.json"

# 2. Update src-tauri/tauri.conf.json
sed -i -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json
echo "Updated src-tauri/tauri.conf.json"

# 3. Update src-tauri/Cargo.toml
sed -i -E "s/version = \"[0-9]+\.[0-9]+\.[0-9]+\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml
echo "Updated src-tauri/Cargo.toml"

# 4. Update distribution/arch/PKGBUILD
sed -i -E "s/pkgver=[0-9]+\.[0-9]+\.[0-9]+/pkgver=$NEW_VERSION/" distribution/arch/PKGBUILD
echo "Updated distribution/arch/PKGBUILD"

echo "Running npm install to update package-lock.json..."
npm install > /dev/null 2>&1

echo "Running cargo check to update Cargo.lock..."
cd src-tauri && cargo update -p petbottle > /dev/null 2>&1 && cd ..

echo "Version successfully updated to $NEW_VERSION in all files!"
