import { LoggerService } from '@backstage/backend-plugin-api';
import { ServiceAccountStrategy } from '@backstage/plugin-kubernetes-backend';
import { promises as fs } from 'fs';
import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import https from 'https';
import { URL } from 'url';

import {
  AuthMetadata,
  ClusterDetails,
  KubernetesCredential
} from '@backstage/plugin-kubernetes-node';

export class VeecodeCustomAuthStrategy extends ServiceAccountStrategy {
  
  constructor(
    private readonly logger: LoggerService,
    private readonly fetchSecretWithRawHttps: boolean,
  ) {
    super();
    this.logger.debug('VEECODE: VeecodeCustomAuthStrategy constructor');
  }

  /**
   * Helper to read authMetadata supporting both:
   * - Config-based clusters: unprefixed keys (secretName, namespace, source, tokenName)
   * - Catalog-based clusters: prefixed keys (vee.codes/secret-name, vee.codes/secret-namespace, etc.)
   */
  private getAuthMetadataValue(authMetadata: AuthMetadata, key: string, defaultValue?: string): string | undefined {
    // Try prefixed version first (catalog annotations)
    const prefixedKey = `vee.codes/${key}`;
    const prefixedValue = authMetadata[prefixedKey];
    if (prefixedValue !== undefined) {
      return prefixedValue;
    }
    
    // Fall back to unprefixed version (config authMetadata)
    const unprefixedValue = authMetadata[key];
    if (unprefixedValue !== undefined) {
      return unprefixedValue;
    }
    
    return defaultValue;
  }

  public async getCredential(
    clusterDetails: ClusterDetails,
  ): Promise<KubernetesCredential> {
    this.logger.debug(`VEECODE: Getting credentials for cluster: ${JSON.stringify(clusterDetails)}`);
    
    // Read secretName from both prefixed and unprefixed locations
    const secretName = this.getAuthMetadataValue(clusterDetails.authMetadata ?? {}, 'kubernetes-secret-name') 
      || this.getAuthMetadataValue(clusterDetails.authMetadata ?? {}, 'secretName');
    
    // If no secretName, use default (inherited) ServiceAccountStrategy behavior
    if (!secretName) {
      this.logger.debug("VEECODE: No secretName found, using default (inherited) ServiceAccountStrategy behavior");
      return super.getCredential(clusterDetails);
    }
    
    // Use custom VeecodeCustomAuthStrategy behavior
    this.logger.debug("VEECODE: Getting credentials using custom VeecodeCustomAuthStrategy behavior");
    let token: string = "";
    
    // read namespace, source and tokenName from authMetadata (supporting both prefixed and unprefixed)
    const namespace = this.getAuthMetadataValue(clusterDetails.authMetadata ?? {}, 'kubernetes-secret-namespace')
      || this.getAuthMetadataValue(clusterDetails.authMetadata ?? {}, 'namespace', 'default')
      || 'default';
    const source = this.getAuthMetadataValue(clusterDetails.authMetadata ?? {}, 'kubernetes-secret-source')
      || this.getAuthMetadataValue(clusterDetails.authMetadata ?? {}, 'source', 'secret')
      || 'secret';
    const tokenName = this.getAuthMetadataValue(clusterDetails.authMetadata ?? {}, 'kubernetes-token-name')
      || this.getAuthMetadataValue(clusterDetails.authMetadata ?? {}, 'tokenName', 'token')
      || 'token';
    
    switch (source) {
      case 'secret':
        // test if fetchSecretWithRawHttps was passed to constructor
        if (this.fetchSecretWithRawHttps) {
          token = await this.getTokenFromSecretWithRawHttps(secretName, namespace, tokenName);
        } else {
          token = await this.getTokenFromSecret(secretName, namespace, tokenName);
        }
        break;
      case 'env':
        token = this.getTokenFromEnv(secretName);
        break;
      case 'file':
        token = await this.getTokenFromFile(secretName);
        break;
      default:
        this.logger.debug("VEECODE: Source ${source} not supported (must be secret, env or file). Getting credentials using default (inherited) ServiceAccountStrategy behavior");
        return super.getCredential(clusterDetails);
    }

    return {
      type: 'bearer token',
      token: token,
    };
  }

  async getTokenFromSecret(secretName: string, namespace: string, tokenName: string): Promise<string> {
    // secretName is the name of the secret
    // namespace is the namespace of the secret
    // return the token from the secret
    try {
      this.logger.debug(`VEECODE: Fetching secret ${secretName} from namespace ${namespace}, looking for field '${tokenName}'`);
      
      const kc = new KubeConfig();
      // Explicitly handle KUBECONFIG environment variable
      if (process.env.KUBERNETES_SERVICE_HOST) {
        this.logger.debug(
          'VEECODE: Detected in-cluster environment, using loadFromCluster()',
        );
        kc.loadFromCluster();
      } else if (process.env.KUBECONFIG) {
        this.logger.debug(`VEECODE: Loading kubeconfig from KUBECONFIG env var: ${process.env.KUBECONFIG}`);
        kc.loadFromFile(process.env.KUBECONFIG);
      } else {
        this.logger.debug(`VEECODE: Loading kubeconfig from default location`);
        kc.loadFromDefault();
      }
      const cluster = kc.getCurrentCluster();
      const user = kc.getCurrentUser();

      // uncomment for desperate debugging
      /*
      const ctx = kc.getCurrentContext();
      this.logger.debug('VEECODE: kubeconfig context details', {
        currentContext: ctx,
        cluster: {
          name: cluster?.name,
          server: cluster?.server,
          skipTLSVerify: cluster?.skipTLSVerify,
          hasCAData: Boolean((cluster as any)?.caData),
          caDataPreview: (cluster as any)?.caData
            ? String((cluster as any).caData).substring(0, 16) + '...'
            : undefined,
          caFile: (cluster as any)?.caFile,
        },
        user: {
          name: user?.name,
          hasCertData: Boolean((user as any)?.certData),
          hasKeyData: Boolean((user as any)?.keyData),
          certFile: (user as any)?.certFile,
          keyFile: (user as any)?.keyFile,
        },
      });
      */

      const caDataPreview = cluster?.caData ? cluster.caData.substring(0, 10) + '...' : 'UNDEFINED';
      this.logger.debug('VEECODE: Current kube config used to fetch secret', {
        server: cluster?.server,
        caData: caDataPreview,
        skipTLSVerify: cluster?.skipTLSVerify,
        user: user?.name
      });
      const coreApi = kc.makeApiClient(CoreV1Api);
      this.logger.debug(`VEECODE: reading secret ${secretName} from namespace ${namespace}`);
      const response = await coreApi.readNamespacedSecret({
        name: secretName, 
        namespace: namespace
      });
      
      this.logger.debug(`VEECODE: Successfully retrieved secret ${secretName}`);
      
      // response.data is already the secret's data field (not a secret object)
      const tokenData = response.data as { [key: string]: string } | undefined;
      
      if (!tokenData) {
        this.logger.error(`VEECODE: Secret ${secretName} has no data`);
        throw new Error(`Secret ${secretName}/${namespace} has no data`);
      }
      
      if (!tokenData[tokenName]) {
        const availableFields = Object.keys(tokenData).join(', ');
        this.logger.error(`VEECODE: Secret ${secretName} missing field '${tokenName}'. Available fields: ${availableFields}`);
        throw new Error(`Secret ${secretName}/${namespace} missing field '${tokenName}'. Available: ${availableFields}`);
      }
      
      // Kubernetes stores data as base64, decode to get the actual token (JWT)
      const decodedToken = Buffer.from(tokenData[tokenName], 'base64').toString('utf-8');
      this.logger.debug(`VEECODE: Successfully decoded token from secret ${secretName}`);
      return decodedToken;

      // returns secret encoded because this is how we need it
      // return tokenData[tokenName];
    } catch (error: any) {
      // If it's an error we already formatted, just re-throw it
      if (error.message?.startsWith('VEECODE: Secret ')) {
        throw error;
      }
      
      // Otherwise, it's a Kubernetes API error
      this.logger.error(`VEECODE: Kubernetes API error fetching secret ${secretName} from namespace ${namespace}:`, {
        message: error?.message || 'Unknown error',
        statusCode: error?.statusCode || error?.response?.statusCode,
        code: error?.code,
        body: error?.body || error?.response?.body,
      });
      
      throw new Error(`Failed to fetch Kubernetes secret ${secretName}/${namespace}: ${error?.message || 'Unknown error'}`);
    }
  }

  async getTokenFromSecretWithRawHttps(secretName: string, namespace: string, tokenName: string): Promise<string> {
    try {
      this.logger.debug(`VEECODE: Fetching secret WITH RAW HTTPS ${secretName} from namespace ${namespace}, looking for field '${tokenName}'`);
      
      // Debug OpenSSL and Node.js versions
      this.logger.debug('VEECODE: Environment info', {
        nodeVersion: process.version,
        opensslVersion: process.versions.openssl,
        platform: process.platform,
        arch: process.arch,
      });
      
      const kc = new KubeConfig();
      // Explicitly handle KUBECONFIG environment variable
      if (process.env.KUBERNETES_SERVICE_HOST) {
        this.logger.debug(
          'VEECODE: Detected in-cluster environment, using loadFromCluster()',
        );
        kc.loadFromCluster();
      } else if (process.env.KUBECONFIG) {
        this.logger.debug(`VEECODE: Loading kubeconfig from KUBECONFIG env var: ${process.env.KUBECONFIG}`);
        kc.loadFromFile(process.env.KUBECONFIG);
      } else {
        this.logger.debug(`VEECODE: Loading kubeconfig from default location`);
        kc.loadFromDefault();
      }
      const cluster = kc.getCurrentCluster();
      const user = kc.getCurrentUser();
      const caDataSample = cluster?.caData ? cluster.caData.substring(0, 10) + '...' + cluster.caData.slice(-10) : 'UNDEFINED';
      const userCertSample = user?.certData ? user.certData.substring(0, 10) + '...' + user.certData.slice(-10) : 'UNDEFINED';
      const userKeySample = user?.keyData ? user.keyData.substring(0, 10) + '...' + user.keyData.slice(-10) : 'UNDEFINED';

      // desperate debugging
      /*
      const ctx = kc.getCurrentContext();
      this.logger.debug('VEECODE: kubeconfig context details', {
        currentContext: ctx,
        cluster: {
          name: cluster?.name,
          server: cluster?.server,
          skipTLSVerify: cluster?.skipTLSVerify,
          hasCAData: Boolean((cluster as any)?.caData),
          caDataPreview: (cluster as any)?.caData
            ? caDataSample
            : undefined,
          caFile: (cluster as any)?.caFile,
        },
        user: {
          name: user?.name,
          hasCertData: Boolean((user as any)?.certData),
          hasKeyData: Boolean((user as any)?.keyData),
          certDataPreview: (user as any)?.certData
            ? userCertSample
            : undefined,
          keyDataPreview: (user as any)?.keyData
            ? userKeySample
            : undefined,
          keyFile: (user as any)?.keyFile,
        },
      });
      */
      // if (cluster) {
      //   this.logger.warn(
      //     'VEECODE: Forcing skipTLSVerify=true for Kubernetes client (DEV ONLY!)',
      //   );
      //   (cluster as any).skipTLSVerify = true;
      // }

      this.logger.debug('VEECODE: Current kube config used to fetch secret', {
        server: cluster?.server,
        caData: caDataSample,
        userCert: userCertSample,
        userKey: userKeySample,
        skipTLSVerify: cluster?.skipTLSVerify,
        user: user?.name
      });

      if (!cluster || !user) {
        throw new Error('Secret cannot be fetched: Cluster or user not found in kubeconfig');
      }
      // const url = new URL(cluster.server.replace('0.0.0.0', 'localhost'));
      const url = new URL(cluster.server);
      // Override hostname for local development
      if (url.hostname === '0.0.0.0') {
        url.hostname = 'localhost';
      }
      const path = `/api/v1/namespaces/${namespace}/secrets/${secretName}`;
      // Build TLS options from kubeconfig
      const tlsOptions: https.AgentOptions = {
        // rejectUnauthorized: false, // Disable validation
        rejectUnauthorized: false,
        servername: 'localhost', // Set servername to localhost since we're connecting to localhost
        allowPartialTrustChain: true,
        requestCert: true,
        // checkServerIdentity: () => undefined, // Bypass hostname validation entirely
      };
      // Temporarily remove all certificates to isolate the issue
      if (cluster.caData) {
        tlsOptions.ca = Buffer.from(cluster.caData, 'base64');
      }
      if (user.certData) {
        tlsOptions.cert = Buffer.from(user.certData, 'base64');
      }
      if (user.keyData) {
        const keyData = Buffer.from(user.keyData, 'base64');
        tlsOptions.key = keyData;
        // Check if we're in FIPS mode and log it
        if (process.env.FIPS_MODE === '1' || process.env.OPENSSL_FIPS === '1') {
          this.logger.debug('VEECODE: FIPS mode detected - EC keys might need special handling');
        }
      }
      this.logger.debug('VEECODE: TLS options', {
        rejectUnauthorized: tlsOptions.rejectUnauthorized,
        servername: tlsOptions.servername,
        // ca: tlsOptions.ca ? tlsOptions.ca.toString() : undefined,
        // cert: tlsOptions.cert ? tlsOptions.cert.toString() : undefined,
        // key: tlsOptions.key ? tlsOptions.key.toString() : undefined,
        ca: tlsOptions.ca ? tlsOptions.ca.toString().substring(0, 35) + '...' + tlsOptions.ca.toString().slice(-35) : undefined,
        cert: tlsOptions.cert ? tlsOptions.cert.toString().substring(0, 35) + '...' + tlsOptions.cert.toString().slice(-35) : undefined,
        key: tlsOptions.key ? tlsOptions.key.toString().substring(0, 35) + '...' + tlsOptions.key.toString().slice(-35) : undefined,
      });

      const agent = new https.Agent(tlsOptions);
      
      // Add certificate debugging during TLS handshake
      // agent.on('keylog', (line) => {
      //   this.logger.debug('VEECODE: TLS keylog:', line);
      // });
      
      const requestOptions: https.RequestOptions = {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path,
        method: 'GET',
        agent: agent,
        headers: {
          Accept: 'application/json',
        },
      };
      this.logger.debug('VEECODE: Request options', {
        protocol: requestOptions.protocol,
        hostname: requestOptions.hostname,
        port: requestOptions.port,
        path: requestOptions.path,
        method: requestOptions.method,
        hasAgent: !!requestOptions.agent
      });
      this.logger.debug(
        `VEECODE: Direct HTTPS request to Kubernetes API ${url.hostname}:${requestOptions.port}${path}`,
      );
      const secretJson = await new Promise<any>((resolve, reject) => {
        const req = https.request(requestOptions, res => {
          let body = '';
          res.on('data', chunk => {
            body += chunk;
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const parsed = JSON.parse(body);
                resolve(parsed);
              } catch (e: any) {
                reject(
                  new Error(
                    `Failed to parse secret response JSON: ${e?.message || e}`,
                  ),
                );
              }
            } else {
              reject(
                new Error(
                  `Kubernetes API returned status ${
                    res.statusCode
                  }: ${body.substring(0, 500)}`,
                ),
              );
            }
          });
        });
        
        // Add certificate debugging on socket secureConnect
        req.on('socket', (socket) => {
          this.logger.debug('VEECODE: Socket event fired');
          socket.on('secureConnect', () => {
            this.logger.debug('VEECODE: SecureConnect event fired');
            const tlsSocket = socket as any;
            
            // Debug socket properties
            this.logger.debug('VEECODE: TLS Socket properties', {
              socketType: typeof tlsSocket,
              socketKeys: Object.keys(tlsSocket),
              authorized: tlsSocket.authorized,
              authorizationError: tlsSocket.authorizationError,
              encrypted: tlsSocket.encrypted,
              protocol: tlsSocket.getProtocol ? tlsSocket.getProtocol() : 'unknown',
              // Additional debugging for container environment
              isServer: tlsSocket.isServer,
              pending: tlsSocket.pending,
              destroyed: tlsSocket.destroyed,
            });
            
            // If authorization succeeded, certificate details might not be available in some OpenSSL versions
            if (tlsSocket.authorized) {
              this.logger.debug('VEECODE: TLS authorization successful - certificate authentication worked');
            } else {
              this.logger.debug('VEECODE: TLS authorization failed', {
                authorizationError: tlsSocket.authorizationError || 'unknown error'
              });
            }
            
            if (tlsSocket.getPeerCertificate) {
              try {
                const peerCert = tlsSocket.getPeerCertificate(true);
                this.logger.debug('VEECODE: Raw peer certificate object', {
                  peerCertType: typeof peerCert,
                  peerCertKeys: peerCert ? Object.keys(peerCert) : 'null',
                  peerCertString: JSON.stringify(peerCert, null, 2),
                });
                
                // Try without the 'true' parameter
                const peerCertSimple = tlsSocket.getPeerCertificate();
                this.logger.debug('VEECODE: Simple peer certificate object', {
                  peerCertSimpleType: typeof peerCertSimple,
                  peerCertSimpleKeys: peerCertSimple ? Object.keys(peerCertSimple) : 'null',
                  peerCertSimpleString: JSON.stringify(peerCertSimple, null, 2),
                });
                
                this.logger.debug('VEECODE: Server certificate details', {
                  subject: peerCert.subject || 'undefined',
                  issuer: peerCert.issuer || 'undefined',
                  validFrom: peerCert.valid_from || 'undefined',
                  validTo: peerCert.valid_to || 'undefined',
                  altNames: peerCert.subjectaltname || 'undefined',
                  rawCert: peerCert.raw ? 'present' : 'missing',
                  certInfo: peerCert.info ? 'present' : 'missing',
                });
              } catch (certError: any) {
                this.logger.debug('VEECODE: Error getting peer certificate', {
                  error: certError.message,
                  errorType: certError.constructor.name
                });
              }
            } else {
              this.logger.debug('VEECODE: getPeerCertificate method not available on socket');
            }
          });
          socket.on('error', (err) => {
            this.logger.debug('VEECODE: Socket error event:', { message: err.message });
          });
        });
        
        req.on('error', err => {
          this.logger.error('VEECODE: Request error details:', {
            message: err.message,
            code: (err as any).code,
            stack: err.stack,
          });
          reject(err);
        });
        req.end();
      });

      this.logger.debug(
        `VEECODE: Successfully retrieved secret ${secretName} via direct HTTPS`,
      );

      const data = secretJson?.data as { [key: string]: string } | undefined;
      if (!data) {
        this.logger.error(`VEECODE: Secret ${secretName} has no data`);
        throw new Error(`Secret ${secretName}/${namespace} has no data`);
      }
      if (!data[tokenName]) {
        const availableFields = Object.keys(data).join(', ');
        this.logger.error(
          `VEECODE: Secret ${secretName} missing field '${tokenName}'. Available fields: ${availableFields}`,
        );
        throw new Error(
          `Secret ${secretName}/${namespace} missing field '${tokenName}'. Available: ${availableFields}`,
        );
      }
      const decodedToken = Buffer.from(
        data[tokenName],
        'base64',
      ).toString('utf-8');

      this.logger.debug(
        `VEECODE: Successfully decoded token from secret ${secretName}`,
      );

      return decodedToken;

    } catch (error: any) {
      // If it's an error we already formatted, just re-throw it
      if (error.message?.startsWith('Secret ')) {
        throw error;
      }
      
      // Otherwise, it's a Kubernetes API error
      this.logger.error(`VEECODE: Kubernetes API error fetching secret ${secretName} from namespace ${namespace}:`, {
        message: error?.message || 'Unknown error',
        statusCode: error?.statusCode || error?.response?.statusCode,
        code: error?.code,
        body: error?.body || error?.response?.body,
      });
      
      throw new Error(`Failed to fetch Kubernetes secret ${secretName}/${namespace}: ${error?.message || 'Unknown error'}`);
    }
  }

  async getTokenFromFile(secretName: string): Promise<string> {
    // secretName is the path to the file
    const token = await fs.readFile(secretName, 'utf-8');
    // Trim whitespace/newlines that might be in the file
    return token.trim();
  }
  
  getTokenFromEnv(secretName: string): string {
    return process.env[secretName] ?? '';
  }

  public presentAuthMetadata(authMetadata: AuthMetadata): AuthMetadata {
    // Return the authMetadata as-is since we're using the secret-token from it
    // this.logger.debug(`VEECODE: Presenting auth metadata for cluster: ${JSON.stringify(authMetadata)}`);
    return super.presentAuthMetadata(authMetadata);
  }

  /*
  public validateCluster(authMetadata: AuthMetadata): Error[] {
    this.logger.debug(`VEECODE: Validating cluster: ${JSON.stringify(authMetadata)}`);
    return [];
  }
  */
}
