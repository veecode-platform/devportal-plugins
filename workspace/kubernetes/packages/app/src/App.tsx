/**
 * New Frontend System (Alpha) - Kubernetes Plugin Example
 * 
 * This app uses the new Backstage frontend system with feature discovery
 * to automatically load plugins and provide a complete Backstage experience.
 */

import { createApp } from '@backstage/frontend-defaults';
import '@backstage/ui/css/styles.css';
// import { veecodeKubernetesAuthModule } from './veecodeKubernetesAuthModule';

/**
 * Create the Backstage app instance with the new frontend system.
 * 
 * With feature discovery enabled in app-config.yaml, plugins are
 * automatically discovered from package.json dependencies.
 */

/*
const app = createApp({
  features: [
    // Register the custom Kubernetes auth provider for 'veecodeauth'
    veecodeKubernetesAuthModule,
  ],
});
*/

const app = createApp();

// Export the app root - this is what gets rendered by React
export default app.createRoot();
