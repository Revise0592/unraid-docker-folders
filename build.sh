#!/usr/bin/env bash
# Build the plugin package and stamp version, md5 and changelog into the .plg.
# Usage: ./build.sh [version] [notes-file]
#   version     YYYY.MM.DD with optional letter suffix (default: today)
#   notes-file  markdown added under <CHANGES> if this version has no entry yet
# Normally run by .github/workflows/release.yml when a GitHub release is published.
set -euo pipefail
cd "$(dirname "$0")"

NAME=simple.docker.folders
PLG="$NAME.plg"
VERSION=${1:-$(date +%Y.%m.%d)}
NOTES=${2:-}
PKG="archive/$NAME-$VERSION-noarch-1.txz"

if [[ ! $VERSION =~ ^[0-9]{4}\.[0-9]{2}\.[0-9]{2}[a-z]?$ ]]; then
  echo "Version must look like 2026.11.10 or 2026.11.10a (got '$VERSION')" >&2
  exit 1
fi

find src -type d -exec chmod 755 {} +
find src -type f -exec chmod 644 {} +

rm -rf archive
mkdir archive
tar --owner=root --group=root --numeric-owner --sort=name -cJf "$PKG" -C src usr
MD5=$(md5sum "$PKG" | cut -d' ' -f1)

sed -i \
  -e "s|^<!ENTITY version .*|<!ENTITY version   \"$VERSION\">|" \
  -e "s|^<!ENTITY md5 .*|<!ENTITY md5       \"$MD5\">|" \
  "$PLG"

# Add a changelog entry (XML-escaped) unless one already exists for this version.
if ! grep -q "^###$VERSION\$" "$PLG"; then
  entry=$(mktemp)
  echo "###$VERSION" > "$entry"
  if [[ -n $NOTES ]] && grep -q '[^[:space:]]' "$NOTES"; then
    tr -d '\r' < "$NOTES" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' >> "$entry"
  else
    echo "- Release $VERSION" >> "$entry"
  fi
  echo >> "$entry"
  sed -i "/^<CHANGES>\$/r $entry" "$PLG"
  rm -f "$entry"
fi

# Sanity check: the .plg must still be valid XML.
python3 -c 'import sys, xml.dom.minidom; xml.dom.minidom.parse(sys.argv[1])' "$PLG"

echo "Built $PKG ($MD5)"
