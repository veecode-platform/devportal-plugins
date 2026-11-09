/**
 * A link that GitLab reports is shown only when it points into the app's own
 * project. Anything else is withheld: the field is left out, and a sentence
 * says the link was withheld instead of naming it.
 */
export const LINK_WITHHELD =
  "(link withheld: it does not point into the app's GitLab project; ask the platform team to find the job by its name)";

const PLAIN_LINK_PATTERN = /^[A-Za-z0-9._~:/?#=&%+@-]+$/;
const DOT_SEGMENT_PATTERN = /\.\.|%2e/i;

/**
 * The link, normalized, when it has the project's origin and sits under the
 * project's own path. The raw text is checked for dot segments first, and the
 * normalized URL is compared, so a link that climbs out of the project is refused.
 */
export function shownLink(
  projectWebUrl: string,
  url: string,
): string | undefined {
  if (!PLAIN_LINK_PATTERN.test(url) || DOT_SEGMENT_PATTERN.test(url)) {
    return undefined;
  }
  let link: URL;
  let project: URL;
  try {
    link = new URL(url);
    project = new URL(projectWebUrl);
  } catch {
    return undefined;
  }
  const base = project.pathname.replace(/\/+$/, '');
  const inside =
    link.origin === project.origin &&
    (link.pathname === base || link.pathname.startsWith(`${base}/`));
  return inside ? link.href : undefined;
}

/** The link as a sentence shows it: the address, or the note that it was withheld. */
export function linkText(projectWebUrl: string, url: string): string {
  return shownLink(projectWebUrl, url) ?? LINK_WITHHELD;
}
