import vertigoIcon from '../assets/vertigo-icon.png';

/*
 * Vertigo favicon.
 *
 * The favicon is NOT reachable from app-config: the shell serves it from
 * `packages/app/public/favicon.ico` (+ the 16/32/192 PNG variants and
 * apple-touch-icon), all baked into the image, and `app.branding` has no favicon
 * key. Changing the image is out of scope (ADR-003: the tenant look is a plugin
 * capability), so the theme plugin swaps the tab icon at runtime instead.
 *
 * `rel` is matched with a prefix check because browsers accept several spellings
 * (`icon`, `shortcut icon`, `apple-touch-icon`) and the shell ships more than
 * one; leaving any of them pointing at the stock file makes some browsers keep
 * showing it. The PNG is bundled by webpack (rhdh-cli export) as an asset URL.
 */
const REPLACED_RELS = ['icon', 'shortcut icon', 'apple-touch-icon'];

export const applyVertigoFavicon = () => {
  if (typeof document === 'undefined') return;

  const head = document.head;
  const links = [
    ...head.querySelectorAll<HTMLLinkElement>('link[rel*="icon"]'),
  ].filter(link => REPLACED_RELS.includes(link.getAttribute('rel') ?? ''));

  if (links.length === 0) {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = vertigoIcon;
    head.appendChild(link);
    return;
  }

  for (const link of links) {
    // `sizes` on the stock 16/32/192 variants would keep the browser picking the
    // closest declared size from the OLD file; the single PNG scales fine.
    link.removeAttribute('sizes');
    link.type = 'image/png';
    link.href = vertigoIcon;
  }
};
