#!/bin/zsh

echo "----- Converting SVGs to PDFs -----"

while read -r f; do
  echo "Converting '$f' ..."
  rsvg-convert -f pdf -o "$f.pdf" "$f"
done < <(find pages -type f -name '*.svg')

echo "----- Conversion done. -----"
echo "----- Merging individual pages into a book ... -----"

# Sort the files by number (for the pages to be in the right order)
files=$(find pages -type f -name '*.pdf'| sort -V)

echo "$files" | xargs "/System/Library/Automator/Combine PDF Pages.action/Contents/MacOS/join" -o output.pdf

echo "----- Done. -----"