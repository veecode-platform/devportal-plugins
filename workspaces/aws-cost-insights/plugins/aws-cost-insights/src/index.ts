import MonetizationOnIcon from '@material-ui/icons/MonetizationOn';

export const CostInsightsIcon = MonetizationOnIcon;

export { awsCostInsightsPlugin, costInsightsAwsPlugin } from './plugin';
export {
  CostInsightsProjectGrowthInstructionsPage,
  CostInsightsLabelDataflowInstructionsPage,
} from '@backstage-community/plugin-cost-insights';

export { CleanCostInsightsPage as CostInsightsPage } from './components/CleanCostInsightsPage';
export { CleanEntityCostCard as EntityCostInsightsContent } from './components/CleanEntityCostCard';
export { EntityClusterCostCard } from './components/EntityClusterCostCard';
export { GlobalClusterCostCard } from './components/GlobalClusterCostCard';

export { costInsightsTranslations, costInsightsTranslationRef } from './translations';
