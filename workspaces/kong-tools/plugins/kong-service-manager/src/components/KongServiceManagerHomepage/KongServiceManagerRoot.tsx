

import { KongServiceManagerProvider } from '../../context/KongServiceManagerContext';
import { KongServiceManagerHomepage } from './KongServiceManagerHomepage';

export function KongServiceManagerRoot() {
  return (
    <KongServiceManagerProvider>
      <KongServiceManagerHomepage />
    </KongServiceManagerProvider>
  );
}
