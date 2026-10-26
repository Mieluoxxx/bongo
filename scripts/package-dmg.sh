#!/usr/bin/env bash
# Builds dist/Bongo.app and dist/Bongo.dmg from this source tree, universal
# (arm64 + x86_64), ad-hoc signed, with the model and the frontend embedded.
#
#   scripts/package-dmg.sh [version]     # version defaults to 0.1.0
set -euo pipefail
cd "$(dirname "$0")/.."

version=${1:-0.1.0}
app=dist/Bongo.app
tmp=$(mktemp -d)
trap 'rm -rf "$tmp" dist/staging' EXIT

rm -rf "$app" dist/Bongo.dmg dist/staging
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"

for arch in arm64 amd64; do
	CGO_ENABLED=0 GOOS=darwin GOARCH=$arch \
		go build -trimpath -ldflags="-s -w" -o "$tmp/bongo-$arch" .
done
lipo -create -output "$app/Contents/MacOS/Bongo" "$tmp/bongo-arm64" "$tmp/bongo-amd64"

# The icon comes from the model's own picture, made large enough for an icns.
sips -z 1024 1024 live2d/vtube/icon.png --out "$tmp/icon.png" >/dev/null
mkdir "$tmp/Bongo.iconset"
for size in 16 32 64 128 256 512; do
	sips -z $size $size "$tmp/icon.png" --out "$tmp/Bongo.iconset/icon_${size}x${size}.png" >/dev/null
	sips -z $((size * 2)) $((size * 2)) "$tmp/icon.png" --out "$tmp/Bongo.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$tmp/Bongo.iconset" -o "$app/Contents/Resources/AppIcon.icns"

cat >"$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key>
	<string>Bongo</string>
	<key>CFBundleDisplayName</key>
	<string>Bongo</string>
	<key>CFBundleIdentifier</key>
	<string>dev.bongo.app</string>
	<key>CFBundleExecutable</key>
	<string>Bongo</string>
	<key>CFBundleIconFile</key>
	<string>AppIcon</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleShortVersionString</key>
	<string>$version</string>
	<key>CFBundleVersion</key>
	<string>$version</string>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
	<key>LSApplicationCategoryType</key>
	<string>public.app-category.entertainment</string>
	<key>NSHighResolutionCapable</key>
	<true/>
</dict>
</plist>
PLIST

codesign --force --sign - "$app"

# The dmg holds the app and a link to /Applications, to drag it there.
mkdir -p dist/staging
cp -R "$app" dist/staging/
ln -sfn /Applications dist/staging/Applications
hdiutil create -volname Bongo -srcfolder dist/staging -fs HFS+ -format UDZO -ov dist/Bongo.dmg >/dev/null

echo "dist/Bongo.dmg $version"
