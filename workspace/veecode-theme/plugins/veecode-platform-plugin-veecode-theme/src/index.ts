// Ships inside the Module-Federation bundle (rhdh-cli plugin export → webpack
// handles the CSS); loads when the remote loads, after the app's static
// `import '@backstage/ui/css/styles.css'` — see ./styles/bui-tokens.css header.
// NOTE: this import breaks `backstage-cli package build` (Rollup) — but that
// step is not on the dynamic-plugin path (export-dynamic depends only on `tsc`),
// so it's a non-issue for the runtime artifact. ADR-011 validation criterion #5.
import './styles/bui-tokens.css';

export { veecodeThemePlugin } from './plugin';
export {
  VeecodeLightThemeProvider,
  VeecodeDarkThemeProvider,
} from './providers';
export { veecodeLight } from './themes/veecodeLight';
export { veecodeDark } from './themes/veecodeDark';
