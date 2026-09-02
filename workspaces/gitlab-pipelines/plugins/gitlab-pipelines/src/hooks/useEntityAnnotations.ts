import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { GITLAB_ANNOTATION, GITLAB_JOBS_ANNOTATION } from '../utils/constants';
import { transformJobsAnnotations } from '../utils/helpers/transformJobsAnnotations';

export const useEntityAnnotations = (entity: Entity) => {
  const projectName = entity?.metadata.annotations?.[GITLAB_ANNOTATION] ?? '';
  const jobsList = entity?.metadata.annotations?.[GITLAB_JOBS_ANNOTATION] ?? '';
  const entityRef = stringifyEntityRef(entity);

  if (!jobsList) {
    return {
      projectName,
      entityRef,
      jobsAnnotations: null,
    };
  }

  return {
    projectName,
    entityRef,
    jobsAnnotations: transformJobsAnnotations(jobsList),
  };
};
