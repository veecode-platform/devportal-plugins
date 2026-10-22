import { ConfigReader } from '@backstage/config';
import { readLambdaTargets } from './config';

const exampleEntry = {
  alias: 'example-target',
  roleArn: 'arn:aws:iam::123456789012:role/example-scaffolder-role',
  functionArn:
    'arn:aws:lambda:us-east-1:123456789012:function:example-function',
  region: 'us-east-1',
};

describe('readLambdaTargets', () => {
  it('keys each configured target by its alias, keeping the external ID', () => {
    const targets = readLambdaTargets(
      new ConfigReader({
        aws: {
          lambdaTargets: [
            { ...exampleEntry, externalId: 'example-external-id' },
          ],
        },
      }),
    );

    expect(targets.get('example-target')).toEqual({
      ...exampleEntry,
      externalId: 'example-external-id',
    });
  });

  it('returns no targets when none are configured', () => {
    expect(readLambdaTargets(new ConfigReader({})).size).toBe(0);
  });

  it('refuses two entries that share an alias', () => {
    expect(() =>
      readLambdaTargets(
        new ConfigReader({
          aws: { lambdaTargets: [exampleEntry, exampleEntry] },
        }),
      ),
    ).toThrow(
      'aws.lambdaTargets lists the alias "example-target" more than once',
    );
  });

  it('refuses an entry without a function ARN', () => {
    expect(() =>
      readLambdaTargets(
        new ConfigReader({
          aws: {
            lambdaTargets: [
              {
                alias: exampleEntry.alias,
                roleArn: exampleEntry.roleArn,
                region: exampleEntry.region,
              },
            ],
          },
        }),
      ),
    ).toThrow(/functionArn/);
  });
});
