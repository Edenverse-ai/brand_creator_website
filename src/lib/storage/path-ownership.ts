/**
 * Structural ownership check for Supabase Storage object paths of the form
 * "{ownerId}/...".
 *
 * A naive `path.startsWith(ownerId + "/")` check is bypassable via traversal
 * segments: "ownId/../victimId/x.jpg" passes that check (it literally starts
 * with "ownId/") but can resolve outside the owner's prefix downstream —
 * wherever the stored path is later normalized (e.g. built into a URL) — and
 * disclose another user's object. This validates the path structurally
 * instead of by prefix string alone.
 *
 * Rules enforced (all must hold):
 * - path is non-empty and does not start with "/"
 * - path does not contain a backslash
 * - splitting on "/" yields at least 2 segments
 * - the first segment equals `ownerId` exactly (non-empty)
 * - no segment is empty (blocks "//"), "." or ".." (blocks traversal)
 */
export function isOwnedStoragePath(path: string, ownerId: string): boolean {
  if (!ownerId || !path) return false;
  if (path.startsWith("/")) return false;
  if (path.includes("\\")) return false;

  const segments = path.split("/");
  if (segments.length < 2) return false;
  if (segments[0] !== ownerId) return false;
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return false;
  }

  return true;
}
