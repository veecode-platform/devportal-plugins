import { createPipelineSchema, playJobSchema } from './schemas';

describe('variables validation', () => {
  it('accepts uppercase keys', () => {
    expect(playJobSchema.parse({ variables: [{ key: 'CONFIRM_DESTROY', value: 'yes' }] }).variables).toHaveLength(1);
  });
  it.each(['ci_job', 'CI_COMMIT_SHA', 'GITLAB_USER', '1ABC', 'a-b'])('rejects %s', key => {
    expect(() => playJobSchema.parse({ variables: [{ key, value: 'x' }] })).toThrow();
  });
  it('requires ref for a new pipeline and caps variables at 20', () => {
    expect(() => createPipelineSchema.parse({})).toThrow();
    const many = Array.from({ length: 21 }, (_, i) => ({ key: `V${i}`, value: 'x' }));
    expect(() => createPipelineSchema.parse({ ref: 'main', variables: many })).toThrow();
  });
});
