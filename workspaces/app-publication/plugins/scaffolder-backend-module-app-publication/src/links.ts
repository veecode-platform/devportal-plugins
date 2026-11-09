/**
 * A link that GitLab reports is shown only when it points into the app's own
 * project. Anything else is withheld: the field is left out, and a sentence
 * says the link was withheld instead of naming it.
 */
export const LINK_WITHHELD =
  "(link withheld: it does not point into the app's GitLab project; ask the platform team to find the job by its name)";

const PLAIN_LINK_PATTERN = /^[A-Za-z0-9._~:/?#=&%+@-]+$/;

/** The address when it is plain and sits under the project's own web address; undefined otherwise. */
export function shownLink(
  projectWebUrl: string,
  url: string,
): string | undefined {
  if (!PLAIN_LINK_PATTERN.test(url)) {
    return undefined;
  }
  return url === projectWebUrl || url.startsWith(`${projectWebUrl}/`)
    ? url
    : undefined;
}

/** The link as a sentence shows it: the address, or the note that it was withheld. */
export function linkText(projectWebUrl: string, url: string): string {
  return shownLink(projectWebUrl, url) ?? LINK_WITHHELD;
}
