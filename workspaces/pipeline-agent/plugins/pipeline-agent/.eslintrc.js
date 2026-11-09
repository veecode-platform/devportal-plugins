module.exports = require('@backstage/cli/config/eslint-factory')(__dirname, {
  // The dynamic export is generated bundle output, not source.
  ignorePatterns: ['**/dist-dynamic/**'],
});
