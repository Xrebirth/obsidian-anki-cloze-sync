/**
 * Utilities for the ignored-file list. Entries are Vault-relative paths and may
 * use `*`/`?` wildcards. A directory entry ignores everything below it, and
 * matching is case-insensitive because Obsidian runs on case-insensitive file
 * systems on Windows and macOS.
 */
export function normalizeVaultPath(value: string): string {
  return value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function normalizeIgnorePatterns(patterns: readonly string[]): string[] {
  return [...new Set(patterns.map(normalizeVaultPath).filter((value) => value.length > 0))];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function globToRegExp(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern.charAt(index);
    if (char === "*") {
      if (pattern.charAt(index + 1) === "*") {
        if (pattern.charAt(index + 2) === "/") {
          // `**/` matches zero or more directories.
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`^${source}$`);
}

export function isIgnoredPath(path: string, patterns: readonly string[]): boolean {
  const normalizedPath = normalizeVaultPath(path);
  if (!normalizedPath) return false;
  for (const pattern of normalizeIgnorePatterns(patterns)) {
    if (pattern.includes("*") || pattern.includes("?")) {
      if (globToRegExp(pattern).test(normalizedPath)) return true;
      continue;
    }
    if (normalizedPath === pattern || normalizedPath.startsWith(`${pattern}/`)) {
      return true;
    }
  }
  return false;
}
