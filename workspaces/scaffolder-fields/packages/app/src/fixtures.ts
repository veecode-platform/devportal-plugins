// The fixtures live in examples/, which devportal-local mounts for proof 2, so the
// dev shell imports them from outside its own package.
/* eslint-disable @backstage/no-relative-monorepo-imports */
import { Entity } from '@backstage/catalog-model';
import codeReview from '../../../examples/entities/skill-code-review.yaml';
import releaseNotes from '../../../examples/entities/skill-release-notes.yaml';
import slow from '../../../examples/entities/skill-slow.yaml';
import manageSkill from '../../../examples/template/template.yaml';

// The YAML loader of the Backstage CLI hands over parsed documents, although
// the shared asset typing declares every .yaml import as a string.
const parsed = <T>(document: unknown) => document as T;

export const skillEntities = [codeReview, releaseNotes, slow].map(document =>
  parsed<Entity>(document),
);

export const templateEntity = parsed<Entity>(manageSkill);

// The catalog answers for this entity two seconds late, so a test can select
// another one in the meantime.
export const slowEntityName = 'skill-slow';
