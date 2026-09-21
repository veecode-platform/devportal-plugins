import upstreamAwsS3CatalogModule from '@backstage/plugin-catalog-backend-module-aws';
import awsS3CatalogModule from './index';

describe('aws-s3-catalog-module', () => {
  it('re-exports the registered upstream catalog backend module', () => {
    expect(awsS3CatalogModule).toBe(upstreamAwsS3CatalogModule);
    expect(awsS3CatalogModule).toMatchObject({
      $$type: '@backstage/BackendFeature',
    });
  });
});
