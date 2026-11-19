/**
 * Utilities for the ignore/include path filters. Entries are Vault-relative
 * paths and may use `*`/`**`/`?` wildcards. A directory entry covers
 * everything below it, and matching is case-insensitive because Obsidian runs
 * on case-insensitive file systems on Windows and macOS.
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

export function normalizePathPatterns(patterns: readonly string[]): string[] {
  return [...new Set(patterns.map(normalizeVaultPath).filter((value) => value.length > 0))];
}

/** Backwards-compatible name used by the ignore-path settings. */
export const normalizeIgnorePatterns = normalizePathPatterns;

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
          // `**/` matches zero or more directories (including none).
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        // `*` intentionally matches across folders too, so a rule such as
        // `知识箱/Development/Embedded/*` covers every nested note.
        source += ".*";
      }
    } else if (char === "?") {
      source += ".";
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`^${source}$`);
}

/** True when the Vault-relative path matches at least one path rule. */
export function matchesPathPatterns(path: string, patterns: readonly string[]): boolean {
  const normalizedPath = normalizeVaultPath(path);
  if (!normalizedPath) return false;
  for (const pattern of normalizePathPatterns(patterns)) {
    if (pattern.includes("*") || pattern.includes("?")) {
      const regex = globToRegExp(pattern);
      if (regex.test(normalizedPath)) return true;
      // A wildcard rule that matches a folder also covers its descendants,
      // e.g. `知识箱/*/Embedded` matches notes below that folder.
      let slash = normalizedPath.lastIndexOf("/");
      while (slash > 0) {
        const ancestor = normalizedPath.slice(0, slash);
        if (regex.test(ancestor)) return true;
        slash = ancestor.lastIndexOf("/");
      }
      continue;
    }
    if (normalizedPath === pattern || normalizedPath.startsWith(`${pattern}/`)) {
      return true;
    }
  }
  return false;
}

export function isIgnoredPath(path: string, patterns: readonly string[]): boolean {
  return matchesPathPatterns(path, patterns);
}

/** Used by the "only sync these paths" mode; empty rules include nothing. */
export function isIncludedPath(path: string, patterns: readonly string[]): boolean {
  return matchesPathPatterns(path, patterns);
}
