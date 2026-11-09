import { shownLink } from './links';

const PROJECT = 'https://gitlab.example.com/example-org/example-app';

describe('shownLink: a link GitLab reports is shown only inside the project', () => {
  it.each([
    `${PROJECT}`,
    `${PROJECT}/-/jobs/301`,
    `${PROJECT}/-/merge_requests/7`,
  ])('shows %s', url => {
    expect(shownLink(PROJECT, url)).toBe(url);
  });

  it.each([
    [
      'another origin',
      'https://attacker.example.com/example-org/example-app/-/jobs/1',
    ],
    [
      'a sibling project with the same prefix',
      'https://gitlab.example.com/example-org/example-app-evil/-/jobs/1',
    ],
    ['a path that climbs out with ..', `${PROJECT}/../other/-/jobs/1`],
    ['an encoded dot segment', `${PROJECT}/%2e%2e/other/-/jobs/1`],
    ['a link with a space', `${PROJECT}/-/jobs/1 and more`],
    [
      'a link with a protocol that is not http',
      ['javascript', 'alert(1)'].join(':'),
    ],
  ])('withholds %s', (_label, url) => {
    expect(shownLink(PROJECT, url)).toBeUndefined();
  });
});
