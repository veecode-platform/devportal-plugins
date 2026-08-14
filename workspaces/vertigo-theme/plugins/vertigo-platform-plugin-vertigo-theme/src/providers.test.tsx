import { createRoot } from 'react-dom/client';
import { act } from 'react';
import {
  VertigoDarkThemeProvider,
  VertigoLightThemeProvider,
} from './providers';

/*
 * Mount check for the theme providers. The parity gate (_scratch/parity) compares
 * theme OBJECTS; this asserts the provider actually renders in a DOM:
 *  - `useThemeOptions` runs (it is a hook — a broken import surfaces here);
 *  - `theme.getTheme('v5')` returns a theme (MUI's ThemeProvider throws on
 *    undefined, and the call site casts the v4|v5 union);
 *  - UnifiedThemeProvider still stamps `data-theme-mode` on <body>, which is what
 *    the `--bui-bg-app` rule in styles/component-fixes.css keys off.
 * Imported from './providers', not './index' — the barrel pulls CSS/font imports
 * that only the webpack (rhdh-cli export) path handles.
 */
// React 18 wants this flag before `act` drives a concurrent root; without it
// every act() call logs "not configured to support act".
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const render = (element: React.ReactElement) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    unmount: () => act(() => root.unmount()),
  };
};

describe('Vertigo theme providers', () => {
  it('mounts the light theme and marks the body light', () => {
    const { container, unmount } = render(
      <VertigoLightThemeProvider>
        <span>content</span>
      </VertigoLightThemeProvider>,
    );

    expect(container.textContent).toBe('content');
    expect(document.body.dataset.themeMode).toBe('light');
    unmount();
  });

  it('mounts the dark theme and marks the body dark', () => {
    const { container, unmount } = render(
      <VertigoDarkThemeProvider>
        <span>content</span>
      </VertigoDarkThemeProvider>,
    );

    expect(container.textContent).toBe('content');
    expect(document.body.dataset.themeMode).toBe('dark');
    unmount();
  });
});
