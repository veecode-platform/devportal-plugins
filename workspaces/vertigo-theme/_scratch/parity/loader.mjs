// ESM hooks so the RHDH theme dist (and @backstage/theme underneath it) can be
// imported in plain Node for the parity gate:
//  - .woff2 imports (webpack asset imports in fonts.esm.js) become string stubs;
//  - CommonJS directory imports (`@material-ui/core/styles`, `@mui/material/styles`)
//    are resolved with CJS semantics and loaded as CommonJS, which is what those
//    packages actually are — Node's ESM resolver refuses them on its own.
// Neither affects the theme objects being compared.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // tsc emits extensionless relative imports (TS source style); add `.js`.
    if (
      err?.code === 'ERR_MODULE_NOT_FOUND' &&
      specifier.startsWith('.') &&
      !specifier.endsWith('.js')
    ) {
      return nextResolve(`${specifier}.js`, context);
    }
    if (
      err?.code === 'ERR_UNSUPPORTED_DIR_IMPORT' &&
      context.parentURL?.startsWith('file:')
    ) {
      const require = createRequire(context.parentURL);
      return {
        url: pathToFileURL(require.resolve(specifier)).href,
        format: 'commonjs',
        shortCircuit: true,
      };
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.woff2')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export default "stub.woff2";',
    };
  }
  return nextLoad(url, context);
}
