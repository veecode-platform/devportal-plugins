import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import type { 
  KubernetesClustersSupplier, 
  ClusterDetails 
} from '@backstage/plugin-kubernetes-node';

/**
 * Enhanced catalog-based cluster supplier that wraps the default catalog locator
 * and adds custom enrichment logic for Veecode-specific requirements.
 */
export class VeecodeEnhancedCatalogSupplier implements KubernetesClustersSupplier {
  constructor(
    private readonly catalogSupplier: KubernetesClustersSupplier,
    private readonly config: Config,
    private readonly logger: LoggerService
  ) {}

  async getClusters(options: { credentials: any }): Promise<ClusterDetails[]> {
    this.logger.debug('VEECODE: Fetching clusters from catalog supplier');
    
    // Get clusters from the default catalog locator
    const catalogClusters = await this.catalogSupplier.getClusters(options);
    
    this.logger.info(`VEECODE: Retrieved ${catalogClusters.length} clusters from catalog`);
    this.logger.debug(`VEECODE: Catalog clusters: ${catalogClusters.map(c => c.name).join(', ')}`);
    
    // Check for duplicates in catalog and keep the most complete version
    const catalogClusterNames = catalogClusters.map(c => c.name);
    const uniqueNames = new Set(catalogClusterNames);
    let finalCatalogClusters = catalogClusters;
    
    if (catalogClusterNames.length !== uniqueNames.size) {
      this.logger.warn(`VEECODE: Found duplicate cluster names in catalog: ${catalogClusterNames.filter((name, index) => catalogClusterNames.indexOf(name) !== index).join(', ')}`);
      
      // Deduplicate: keep the cluster with the most properties for each name
      const deduplicatedClusters: ClusterDetails[] = [];
      const seenNames = new Map<string, ClusterDetails>();
      
      for (const cluster of catalogClusters) {
        const existing = seenNames.get(cluster.name);
        if (!existing) {
          seenNames.set(cluster.name, cluster);
          deduplicatedClusters.push(cluster);
        } else {
          // Keep the one with more properties (more complete)
          const existingProps = Object.keys(existing).length;
          const newProps = Object.keys(cluster).length;
          if (newProps > existingProps) {
            this.logger.debug(`VEECODE: Replacing ${cluster.name} with more complete version (${existingProps} -> ${newProps} properties)`);
            const index = deduplicatedClusters.findIndex(c => c.name === cluster.name);
            deduplicatedClusters[index] = cluster;
            seenNames.set(cluster.name, cluster);
          } else {
            this.logger.debug(`VEECODE: Keeping existing ${cluster.name} with ${existingProps} properties vs ${newProps} properties`);
          }
        }
      }
      
      this.logger.info(`VEECODE: Deduplicated ${catalogClusters.length} catalog clusters to ${deduplicatedClusters.length} unique clusters`);
      finalCatalogClusters = deduplicatedClusters;
    }
    
    // Enhance clusters with additional logic
    const enhancedClusters = finalCatalogClusters.map(cluster => this.enhanceCluster(cluster));
    
    // Optionally merge with config-based clusters
    const mergedClusters = this.mergeWithConfigClusters(enhancedClusters);
    
    this.logger.info(`VEECODE: Returning ${mergedClusters.length} total clusters after enhancement`);
    
    return mergedClusters;
  }

  /**
   * Enhance individual cluster details with custom metadata
   */
  private enhanceCluster(cluster: ClusterDetails): ClusterDetails {
    this.logger.debug(`VEECODE: Enhancing cluster: ${cluster.name}`);
    
    const enhanced: ClusterDetails = {
      ...cluster,
      // Add default values if missing
      skipTLSVerify: cluster.skipTLSVerify ?? this.getDefaultSkipTLSVerify(),
      skipMetricsLookup: cluster.skipMetricsLookup ?? this.getDefaultSkipMetricsLookup(),
    };

    // Enrich authMetadata with additional fields if needed
    if (cluster.authMetadata) {
      enhanced.authMetadata = {
        ...cluster.authMetadata,
        // Add veecode-specific metadata
        'veecode.enhanced': 'true',
      };
    }

    // Add custom validation
    this.validateCluster(enhanced);

    return enhanced;
  }

  /**
   * Merge catalog clusters with config-based clusters according to the rules:
   * 1. Catalog-only: use catalog annotations as-is
   * 2. Config-only: use config fields as-is  
   * 3. Both exist: merge, with config taking precedence
   */
  private mergeWithConfigClusters(catalogClusters: ClusterDetails[]): ClusterDetails[] {
    const mergeEnabled = this.config.getOptionalBoolean('veecode.kubernetes.mergeCatalogWithConfig') ?? true;
    
    if (!mergeEnabled) {
      return catalogClusters;
    }

    this.logger.debug('VEECODE: Merging catalog clusters with config-based clusters');
    
    const configClusters = this.getConfigClusters();
    this.logger.debug(`VEECODE: Found ${configClusters.length} config clusters: ${configClusters.map(c => c.name).join(', ')}`);
    
    const configClustersByName = new Map(configClusters.map(c => [c.name, c]));
    const catalogClusterNames = new Set(catalogClusters.map(c => c.name));
    
    // Case 1 & 3: Process catalog clusters (catalog-only or merged)
    const processedCatalogClusters = catalogClusters.map(catalogCluster => {
      const configCluster = configClustersByName.get(catalogCluster.name);
      
      if (configCluster) {
        // Case 3: Both exist - merge with config precedence
        this.logger.debug(`VEECODE: Merging cluster ${catalogCluster.name} from catalog and config (config has precedence)`);
        
        return {
          ...catalogCluster,    // Start with catalog (annotations)
          ...configCluster,     // Override with config fields
          // Special handling for authMetadata - merge rather than replace
          authMetadata: {
            ...catalogCluster.authMetadata,
            ...configCluster.authMetadata,
          },
        };
      } else {
        // Case 1: Catalog-only - use as-is
        this.logger.debug(`VEECODE: Using catalog-only cluster: ${catalogCluster.name}`);
        return catalogCluster;
      }
    });
    
    // Case 2: Add config-only clusters (not in catalog)
    const configOnlyClusters = configClusters.filter(
      configCluster => !catalogClusterNames.has(configCluster.name)
    );
    
    if (configOnlyClusters.length > 0) {
      this.logger.info(`VEECODE: Adding ${configOnlyClusters.length} config-only clusters: ${configOnlyClusters.map(c => c.name).join(', ')}`);
    }
    
    const mergedCount = processedCatalogClusters.filter(c => configClustersByName.has(c.name)).length;
    if (mergedCount > 0) {
      this.logger.info(`VEECODE: Merged ${mergedCount} clusters from catalog + config (config precedence)`);
    }
    
    return [...processedCatalogClusters, ...configOnlyClusters];
  }

  /**
   * Extract config-based clusters from app-config
   */
  private getConfigClusters(): ClusterDetails[] {
    const clustersMethods = this.config.getOptionalConfigArray('kubernetes.clusterLocatorMethods') ?? [];
    
    for (const method of clustersMethods) {
      const type = method.getOptionalString('type');
      if (type === 'config') {
        const clusters = method.getOptionalConfigArray('clusters') ?? [];
        return clusters.map(clusterConfig => ({
          name: clusterConfig.getString('name'),
          url: clusterConfig.getString('url'),
          authMetadata: clusterConfig.getOptional('authMetadata') as Record<string, string> ?? {},
          skipTLSVerify: clusterConfig.getOptionalBoolean('skipTLSVerify'),
          skipMetricsLookup: clusterConfig.getOptionalBoolean('skipMetricsLookup'),
          caData: clusterConfig.getOptionalString('caData'),
          caFile: clusterConfig.getOptionalString('caFile'),
          dashboardUrl: clusterConfig.getOptionalString('dashboardUrl'),
          dashboardApp: clusterConfig.getOptionalString('dashboardApp'),
          title: clusterConfig.getOptionalString('title'),
        }));
      }
    }
    
    return [];
  }

  /**
   * Validate cluster configuration
   */
  private validateCluster(cluster: ClusterDetails): void {
    if (!cluster.name) {
      this.logger.warn('VEECODE: Cluster missing name');
    }
    
    if (!cluster.url) {
      this.logger.warn(`VEECODE: Cluster ${cluster.name} missing URL`);
    }
    
    // Add custom validation rules here
    const requireAuthMetadata = this.config.getOptionalBoolean('veecode.kubernetes.requireAuthMetadata') ?? false;
    if (requireAuthMetadata && (!cluster.authMetadata || Object.keys(cluster.authMetadata).length === 0)) {
      this.logger.warn(`VEECODE: Cluster ${cluster.name} missing authMetadata`);
    }
  }

  /**
   * Get default skipTLSVerify setting from config
   */
  private getDefaultSkipTLSVerify(): boolean {
    return this.config.getOptionalBoolean('veecode.kubernetes.defaultSkipTLSVerify') ?? false;
  }

  /**
   * Get default skipMetricsLookup setting from config
   */
  private getDefaultSkipMetricsLookup(): boolean {
    return this.config.getOptionalBoolean('veecode.kubernetes.defaultSkipMetricsLookup') ?? false;
  }
}
