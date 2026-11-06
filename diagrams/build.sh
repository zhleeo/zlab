#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

OUT_DIR="$(cd ../static/images/diagrams && pwd)"
JAR="../tools/plantuml.jar"

if command -v d2 >/dev/null 2>&1; then
  for f in *.d2; do
    name="$(basename "$f" .d2)"
    d2 --theme 0 --pad 10 "$f" "$OUT_DIR/$name.svg" >/dev/null
    echo "d2      -> $name.svg"
  done
else
  echo "跳过 D2：未找到 d2 命令，安装方式 brew install d2" >&2
fi

if [[ -f "$JAR" ]]; then
  java -jar "$JAR" -tsvg -Dfile.encoding=UTF-8 -o "$OUT_DIR" puml/*.puml 2>/dev/null
  for f in puml/*.puml; do
    name="$(basename "$f" .puml)"
    perl -pi -e 's/font-family="PingFang SC"/font-family="PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif"/g' "$OUT_DIR/$name.svg"
    echo "puml    -> $name.svg"
  done
else
  echo "跳过 PlantUML：缺少 $JAR，下载命令：" >&2
  echo "  mkdir -p tools && curl -L -o tools/plantuml.jar \\" >&2
  echo "    https://repo1.maven.org/maven2/net/sourceforge/plantuml/plantuml/1.2024.7/plantuml-1.2024.7.jar" >&2
fi

chmod 644 "$OUT_DIR"/*.svg 2>/dev/null || true