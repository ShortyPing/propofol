#!/bin/zsh

echo "----- Converting SVGs to PDFs -----"

for f in pages/*.svg; do
  echo "Converting '$f' ..."
  rsvg-convert -f pdf -o "$f.pdf" "$f"
done

echo "----- Conversion done. -----"
echo "----- Merging individual pages into a book ... -----"

files=$(ls pages/*.svg.pdf | sort -V)

echo "$files" | xargs "/System/Library/Automator/Combine PDF Pages.action/Contents/MacOS/join" -o output.pdf

echo "----- Done. -----"