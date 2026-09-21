// monaco-editor@0.55 publishes this file, but its wildcard export map omits
// the extension required by TypeScript's bundler resolution.
declare module 'monaco-editor/esm/vs/editor/editor.api' {
  export * from 'monaco-editor/esm/vs/editor/editor.api.js';
}
