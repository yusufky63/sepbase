export function isSafeOriginRelativePath(value: string) {
  let decoded = value;
  for (let pass = 0; pass < 4; pass += 1) {
    if (
      !decoded.startsWith("/")
      || decoded.startsWith("//")
      || decoded.includes("\\")
      || decoded.includes("..")
      || /[?#\u0000-\u001f\u007f]/.test(decoded)
    ) return false;

    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return false;
    }
    if (next === decoded) return true;
    decoded = next;
  }
  return false;
}
