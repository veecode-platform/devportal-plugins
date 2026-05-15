import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { 
  kubernetesAuthStrategyExtensionPoint,
  kubernetesClusterSupplierExtensionPoint,
} from '@backstage/plugin-kubernetes-node';
import { VeecodeCustomAuthStrategy } from './VeecodeCustomAuthStrategy';
import { VeecodeEnhancedCatalogSupplier } from './VeecodeEnhancedCatalogSupplier';
// import { ServiceAccountStrategy } from '@backstage/plugin-kubernetes-backend';
import { addDefaultKubernetesAuthStrategies } from './addDefaultKubernetesAuthStrategies';

export const kubernetesVeecodeModule = createBackendModule({
  pluginId: 'kubernetes',
  moduleId: 'veecodeauth',
  register(reg) {
    reg.registerInit({
      deps: { 
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        // lifecycle: coreServices.lifecycle,
        authStrategy: kubernetesAuthStrategyExtensionPoint,
        clusterSupplier: kubernetesClusterSupplierExtensionPoint,
      },
      async init({ logger, config, authStrategy, clusterSupplier }) {
        // Extension 1: Custom Auth Strategy
        if (config.getOptionalBoolean('veecode.kubernetes.addDefaultKubernetesAuthStrategies') === true) {
          logger.info('VEECODE: Registering default Kubernetes auth strategies');
          addDefaultKubernetesAuthStrategies(authStrategy, config, logger);
        }
        logger.info('VEECODE: Registering VeecodeCustomAuthStrategy authentication strategy for Kubernetes');
        // authStrategy.addAuthStrategy("veecodeauth", new VeecodeCustomAuthStrategy(logger));
        const fetchSecretWithRawHttps = config.getOptionalBoolean('veecode.kubernetes.fetchSecretWithRawHttps') ?? false;
        authStrategy.addAuthStrategy("serviceAccount", new VeecodeCustomAuthStrategy(logger, fetchSecretWithRawHttps));
        // logger.debug('VEECODE: Registering ServiceAccountStrategy authentication strategy for Kubernetes');
        // authStrategy.addAuthStrategy("serviceAccount", new ServiceAccountStrategy());
        logger.debug('VEECODE: Successfully registered VeecodeCustomAuthStrategy');

        // Extension 2: Enhanced Catalog Cluster Supplier
        const enableEnhancedCatalogSupplier = config.getOptionalBoolean('veecode.kubernetes.enableEnhancedCatalogSupplier') ?? true;
        if (enableEnhancedCatalogSupplier) {
          logger.info('VEECODE: Registering enhanced catalog cluster supplier');
          
          // Use a factory function to wrap the default supplier
          clusterSupplier.addClusterSupplier(async ({ getDefault }) => {
            const defaultSupplier = await getDefault();
            return new VeecodeEnhancedCatalogSupplier(
              defaultSupplier,
              config,
              logger
            );
          });
          
          logger.debug('VEECODE: Successfully registered VeecodeEnhancedCatalogSupplier');
        } else {
          logger.info('VEECODE: Enhanced catalog cluster supplier disabled by configuration');
        }
      },
    });
  },
});

export default kubernetesVeecodeModule;