const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { checkWorkspace } = require('./check-dynamic-plugin-config.js');

function createWorkspaceFixture(pluginConfig) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'devportal-plugin-config-'),
  );
  const pluginRoot = path.join(root, 'plugins', 'aws-cost-insights');
  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.writeFileSync(path.join(root, 'dynamic-plugins.yaml'), 'plugins: []\n');

  const packagePath = path.join(pluginRoot, 'package.json');
  fs.writeFileSync(
    packagePath,
    JSON.stringify({
      name: '@veecode-platform/plugin-aws-cost-insights',
      version: '1.0.0',
      backstage: {
        role: 'frontend-plugin',
        pluginPackages: ['@veecode-platform/plugin-aws-cost-insights'],
      },
      configSchema: 'config.d.ts',
    }),
  );

  return {
    root,
    packagePath,
    readDynamicConfig: async () => ({
      plugins: [
        {
          package:
            './dynamic-plugins/dist/veecode-platform-plugin-aws-cost-insights-dynamic',
          disabled: false,
          pluginConfig,
        },
      ],
    }),
  };
}

function createSchemaLoader(schemaEntries) {
  return async (options) => {
    const entries = options.serialized?.schemas ?? schemaEntries;
    return {
      serialize: () => ({
        backstageConfigSchemaVersion: 1,
        schemas: entries,
      }),
      process: (configs) => {
        const data = configs[0].data;
        const messages = [];

        function visit(schema, value, pointer = '') {
          for (const property of schema.required ?? []) {
            if (value?.[property] === undefined) {
              messages.push(
                `Config must have required property '${property}' { missingProperty=${property} } at ${pointer}`,
              );
            }
          }

          for (const [property, propertySchema] of Object.entries(
            schema.properties ?? {},
          )) {
            if (value?.[property] !== undefined && propertySchema.properties) {
              visit(propertySchema, value[property], `${pointer}/${property}`);
            }
          }
        }

        for (const entry of entries) {
          visit(entry.value, data);
        }

        if (messages.length > 0) {
          const error = new Error(messages.join('; '));
          error.messages = messages;
          throw error;
        }

        return configs;
      },
    };
  };
}

test('reports a missing required plugin property and accepts the shipped default', async () => {
  const schemaEntries = [
    {
      packageName: '@backstage-community/plugin-cost-insights',
      path: 'node_modules/@backstage-community/plugin-cost-insights/config.d.ts',
      value: {
        type: 'object',
        properties: { costInsights: { type: 'object' } },
        required: ['costInsights'],
      },
    },
  ];
  const invalid = createWorkspaceFixture({
    dynamicPlugins: { frontend: {} },
  });

  const invalidResult = await checkWorkspace(invalid.root, {
    loadConfigSchema: createSchemaLoader(schemaEntries),
    readDynamicConfig: invalid.readDynamicConfig,
    resolvePackageManifest: () => invalid.packagePath,
  });

  assert.equal(invalidResult.errors.length, 1);
  assert.equal(invalidResult.errors[0].propertyPath, 'costInsights');
  assert.equal(
    invalidResult.errors[0].packageName,
    '@backstage-community/plugin-cost-insights',
  );
  assert.match(invalidResult.errors[0].schemaFile, /config\.d\.ts$/);

  const valid = createWorkspaceFixture({
    dynamicPlugins: { frontend: {} },
    costInsights: { engineerCost: 0 },
  });
  const validResult = await checkWorkspace(valid.root, {
    loadConfigSchema: createSchemaLoader(schemaEntries),
    readDynamicConfig: valid.readDynamicConfig,
    resolvePackageManifest: () => valid.packagePath,
  });

  assert.deepEqual(validResult.errors, []);
});

test('reports a missing nested property from the dependency schema', async () => {
  const schemaEntries = [
    {
      packageName: '@backstage-community/plugin-cost-insights',
      path: 'node_modules/@backstage-community/plugin-cost-insights/config.d.ts',
      value: {
        type: 'object',
        properties: {
          costInsights: {
            type: 'object',
            properties: { engineerCost: { type: 'number' } },
            required: ['engineerCost'],
          },
        },
        required: ['costInsights'],
      },
    },
  ];
  const fixture = createWorkspaceFixture({ costInsights: {} });

  const result = await checkWorkspace(fixture.root, {
    loadConfigSchema: createSchemaLoader(schemaEntries),
    readDynamicConfig: fixture.readDynamicConfig,
    resolvePackageManifest: () => fixture.packagePath,
  });

  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].propertyPath, 'costInsights.engineerCost');
});

test('does not require host app and backend roots in pluginConfig', async () => {
  const schemaEntries = [
    {
      packageName: '@backstage/core-app-api',
      path: 'node_modules/@backstage/core-app-api/config.schema.json',
      value: {
        type: 'object',
        properties: { app: { type: 'object' }, backend: { type: 'object' } },
        required: ['app', 'backend'],
      },
    },
    {
      packageName: '@backstage-community/plugin-cost-insights',
      path: 'node_modules/@backstage-community/plugin-cost-insights/config.d.ts',
      value: {
        type: 'object',
        properties: { costInsights: { type: 'object' } },
        required: ['costInsights'],
      },
    },
  ];
  const fixture = createWorkspaceFixture({ costInsights: { engineerCost: 0 } });

  const result = await checkWorkspace(fixture.root, {
    loadConfigSchema: createSchemaLoader(schemaEntries),
    readDynamicConfig: fixture.readDynamicConfig,
    resolvePackageManifest: () => fixture.packagePath,
  });

  assert.deepEqual(result.errors, []);
});

test('validates a published plugin that ships no dynamic-plugins.yaml as empty config', async () => {
  const schemaEntries = [
    {
      packageName: '@backstage-community/plugin-cost-insights',
      path: 'node_modules/@backstage-community/plugin-cost-insights/config.d.ts',
      value: {
        type: 'object',
        properties: { costInsights: { type: 'object' } },
        required: ['costInsights'],
      },
    },
  ];
  const fixture = createWorkspaceFixture({});
  fs.rmSync(path.join(fixture.root, 'dynamic-plugins.yaml'));

  const result = await checkWorkspace(fixture.root, {
    loadConfigSchema: createSchemaLoader(schemaEntries),
    readDynamicConfig: fixture.readDynamicConfig,
    resolvePackageManifest: () => fixture.packagePath,
  });

  assert.equal(result.skipped, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].propertyPath, 'costInsights');

  const manifest = JSON.parse(fs.readFileSync(fixture.packagePath, 'utf8'));
  fs.writeFileSync(
    fixture.packagePath,
    JSON.stringify({ ...manifest, private: true }),
  );
  const privateResult = await checkWorkspace(fixture.root, {
    loadConfigSchema: createSchemaLoader(schemaEntries),
    readDynamicConfig: fixture.readDynamicConfig,
    resolvePackageManifest: () => fixture.packagePath,
  });

  assert.equal(privateResult.skipped, true);
});

test('reports a schema that does not compile as unavailable, not as a config error', async () => {
  const fixture = createWorkspaceFixture({});
  const result = await checkWorkspace(fixture.root, {
    loadConfigSchema: async () => {
      throw new Error(
        "config.d.ts(17,29): error TS2307: Cannot find module './src'",
      );
    },
    readDynamicConfig: fixture.readDynamicConfig,
    resolvePackageManifest: () => fixture.packagePath,
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.unavailable.length, 1);
  assert.equal(
    result.unavailable[0].packageName,
    '@veecode-platform/plugin-aws-cost-insights',
  );
});
