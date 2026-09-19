/**
 * Showing and hiding through the `hidden` attribute was written out at thirty
 * sites, each one a two-branch `setAttribute`/`removeAttribute` pair guarded by
 * a null check. One helper, so the guard and the empty-string second argument
 * are written once.
 */
export function setHidden(el: Element | null | undefined, hidden: boolean) {
  if (!el) return;
  if (hidden) el.setAttribute('hidden', '');
  else el.removeAttribute('hidden');
}
