import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "app");
const registryFiles = [
  "app/lib/i18nRegistry.ts",
  "app/lib/homepageStaticContent.ts",
  "app/lib/homepageConfig.ts",
  "app/lib/propertyFeatures.ts",
  "app/lib/statusLabels.ts",
  "app/lib/partner.ts",
];

const inspectedExtensions = new Set([".ts", ".tsx"]);
const ignoredDirs = new Set(["node_modules", ".next", ".git"]);
const ignoredFiles = new Set([
  "app/lib/i18nRegistry.ts",
  "app/lib/homepageStaticContent.ts",
  "app/lib/translationInventory.ts",
]);

const registryFieldPattern =
  /\b(?:baseText|label|title|description|copy|body|subtitle|eyebrow|placeholder|cta|state)\s*:\s*(['"`])((?:\\.|(?!\1).)*?[A-Za-z][\s\S]*?)\1/g;
const quotedEnglishPattern = /(['"`])((?:\\.|(?!\1).)*?[A-Za-z][^'"`]*)\1/g;
const objectFieldPattern =
  /\b(?:title|label|description|copy|body|subtitle|eyebrow|placeholder|cta|helper|badge|state)\s*:\s*(['"`])((?:\\.|(?!\1).)*?[A-Za-z][\s\S]*?)\1/g;
const jsxTextPattern = />\s*([^<>{}\n]*[A-Za-z][^<>{}\n]*)\s*</g;
const jsxAttrPattern =
  /\b(?:placeholder|aria-label|title|alt|fallbackTitle|fallbackDescription)\s*=\s*(['"`])((?:\\.|(?!\1).)*?[A-Za-z][\s\S]*?)\1/g;

const allowPatterns = [
  /^use /,
  /^use client$/,
  /^use server$/,
  /^server-only$/,
  /^node:/,
  /^@?\//,
  /^\./,
  /^https?:\/\//,
  /^[A-Z0-9_]+$/,
  /^[a-z0-9_./:-]+$/,
  /^\d+$/,
  /^\{.*\}$/,
  /^className$/,
];

function normalizeText(value) {
  return value
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) return [];
        return walk(fullPath);
      }
      if (!inspectedExtensions.has(path.extname(entry.name))) return [];
      return [fullPath];
    })
  );

  return files.flat();
}

async function readText(file) {
  try {
    return await fs.readFile(path.join(root, file), "utf8");
  } catch {
    return "";
  }
}

async function collectRegisteredBaseText() {
  const registered = new Set();

  for (const file of registryFiles) {
    const content = await readText(file);
    for (const match of content.matchAll(registryFieldPattern)) {
      const text = normalizeText(match[2]);
      if (text) registered.add(text.toLowerCase());
    }
    for (const match of content.matchAll(quotedEnglishPattern)) {
      const text = normalizeText(match[2]);
      if (isProbablyUiString(text)) registered.add(text.toLowerCase());
    }
  }

  return registered;
}

function isProbablyUiString(text) {
  const normalized = normalizeText(text);
  if (normalized.length < 3 || normalized.length > 220) return false;
  if (!/[A-Za-z]/.test(normalized)) return false;
  if (allowPatterns.some((pattern) => pattern.test(normalized))) return false;
  if (/^[\w.-]+\.(ts|tsx|js|jsx|css|png|jpg|webp|svg)$/.test(normalized)) {
    return false;
  }
  return true;
}

function collectMatches(content, pattern, file, registered, findings, kind) {
  for (const match of content.matchAll(pattern)) {
    const text = normalizeText(match[2] ?? match[1]);
    if (!isProbablyUiString(text)) continue;
    if (registered.has(text.toLowerCase())) continue;

    findings.push({
      file,
      line: lineNumberForIndex(content, match.index ?? 0),
      kind,
      text,
    });
  }
}

const registered = await collectRegisteredBaseText();
const files = await walk(sourceRoot);
const findings = [];

for (const fullPath of files) {
  const relative = path.relative(root, fullPath);
  if (ignoredFiles.has(relative)) continue;

  const content = await fs.readFile(fullPath, "utf8");
  collectMatches(content, objectFieldPattern, relative, registered, findings, "object-field");
  collectMatches(content, jsxAttrPattern, relative, registered, findings, "jsx-attr");
  collectMatches(content, jsxTextPattern, relative, registered, findings, "jsx-text");
}

const unique = new Map();
for (const finding of findings) {
  unique.set(
    `${finding.file}:${finding.line}:${finding.kind}:${finding.text}`,
    finding
  );
}

const sorted = Array.from(unique.values()).sort((a, b) =>
  a.file.localeCompare(b.file) || a.line - b.line || a.text.localeCompare(b.text)
);

console.log(`i18n audit scanned ${files.length} files.`);
console.log(`Registered base strings loaded: ${registered.size}.`);
console.log(`Suspicious unregistered UI strings: ${sorted.length}.`);

for (const finding of sorted.slice(0, 200)) {
  console.log(
    `${finding.file}:${finding.line} [${finding.kind}] ${JSON.stringify(
      finding.text
    )}`
  );
}

if (sorted.length > 200) {
  console.log(`...and ${sorted.length - 200} more.`);
}

console.log("Audit is advisory only; build status is not affected.");
