import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { kubernetesAuthStrategyExtensionPoint } from '@backstage/plugin-kubernetes-node';
import { VeecodeCustomAuthStrategy } from './VeecodeCustomAuthStrategy';
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
        authStrategy: kubernetesAuthStrategyExtensionPoint
      },
      async init({ logger, config, authStrategy }) {
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
      },
    });
  },
});

export default kubernetesVeecodeModule;