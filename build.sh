#!/usr/bin/env bash
# Build the plugin package and stamp its version + md5 into the .plg.
# Usage: ./build.sh [version]   (default: today's date, YYYY.MM.DD)
set -euo pipefail
cd "$(dirname "$0")"

NAME=simple.docker.folders
VERSION=${1:-$(date +%Y.%m.%d)}
PKG="archive/$NAME-$VERSION-noarch-1.txz"

find src -type d -exec chmod 755 {} +
find src -type f -exec chmod 644 {} +

rm -f archive/"$NAME"-*.txz
mkdir -p archive
tar --owner=root --group=root --numeric-owner --sort=name -cJf "$PKG" -C src usr

MD5=$(md5sum "$PKG" | cut -d' ' -f1)
sed -i \
  -e "s|^<!ENTITY version .*|<!ENTITY version   \"$VERSION\">|" \
  -e "s|^<!ENTITY md5 .*|<!ENTITY md5       \"$MD5\">|" \
  "$NAME.plg"

echo "Built $PKG ($MD5)"
grep -q "^###$VERSION\$" "$NAME.plg" || echo "Reminder: add a ###$VERSION entry to <CHANGES> in $NAME.plg"
