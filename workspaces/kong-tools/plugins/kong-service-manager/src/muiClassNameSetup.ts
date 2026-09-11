// Upstream RHDH known issue RHIDP-5170: MUI v5 dynamic plugins render with
// missing/clashing styles. The documented workaround imports the generator
// from '@mui/material/className' — but module federation shares the BARREL
// '@mui/material' (mf-manifest), so the deep import can resolve to the
// plugin's local copy while components resolve to the host-shared instance,
// making the workaround inert (proven live: prefix code shipped, DOM classes
// stayed unprefixed). Importing via the barrel configures the SAME instance
// the components use.
import { unstable_ClassNameGenerator as ClassNameGenerator } from '@mui/material';

let configured = false;

/**
 * Called at module scope in plugin.ts. It must be a CALL in the used module
 * graph, not a bare side-effect import: package.json sets `sideEffects: false`,
 * so webpack tree-shakes side-effect-only imports out of the dynamic bundle.
 */
export function configureMuiClassNames(): void {
  if (configured) return;
  configured = true;
  ClassNameGenerator.configure(name =>
    name.startsWith('v5-') ? name : `v5-${name}`,
  );
}
