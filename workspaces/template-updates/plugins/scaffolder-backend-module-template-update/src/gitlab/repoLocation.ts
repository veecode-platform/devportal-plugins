import { InputError } from '@backstage/errors';

export interface ParsedGitlabLocation {
  host: string;
  projectSlug: string;
  repoUrl: string;
  path: string;
}

export function parseGitlabLocation(location: string): ParsedGitlabLocation {
  const value = location.startsWith('url:') ? location.slice(4) : location;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InputError(`Unsupported GitLab location: ${location}`);
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const markerIndex = segments.indexOf('-');
  const repoSegments =
    markerIndex === -1 ? segments : segments.slice(0, markerIndex);
  if (repoSegments.length < 2) {
    throw new InputError(
      `GitLab location has no group/project path: ${location}`,
    );
  }

  let pathSegments: string[] = [];
  if (markerIndex !== -1) {
    const route = segments[markerIndex + 1];
    pathSegments =
      route === 'tree' || route === 'blob' || route === 'raw'
        ? segments.slice(markerIndex + 3)
        : segments.slice(markerIndex + 1);
  }

  return {
    host: url.host,
    projectSlug: repoSegments.map(decodeURIComponent).join('/'),
    repoUrl: `${url.origin}/${repoSegments.map(encodeURIComponent).join('/')}`,
    path: pathSegments.map(decodeURIComponent).join('/'),
  };
}
