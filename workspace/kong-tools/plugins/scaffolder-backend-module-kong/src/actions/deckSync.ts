import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

/**
 * Creates a `veecode:kong:deck:sync` Scaffolder action.
 *
 * @remarks
 *
 * This action uses the deck CLI tool to sync a Kong declarative configuration
 * to a Kong Gateway instance.
 *
 * @public
 */
export function createDeckSyncAction() {
  return createTemplateAction({
    id: 'veecode:kong:deck:sync',
    description: 'Syncs a Kong YAML configuration to Kong Gateway using deck',
    schema: {
      input: {
        kongConfigPath: z =>
          z.string({
            description: 'The path to the Kong YAML file to sync (relative to workspace)',
          }).optional().default('kong.yaml'),
        deckCommand: z =>
          z.string({
            description: 'The deck command to run',
          }).optional().default('deck gateway sync'),
        kongAddr: z =>
          z.string({
            description: 'Kong Admin API address (if not provided, deck uses its own defaults/env vars)',
          }).optional(),
        deckFlags: z =>
          z.string({
            description: 'Additional flags to pass to deck command',
          }).optional().default(''),
        deckTag: z =>
          z.string({
            description: 'Tag to filter Kong entities (passed to --select-tag)',
          }).optional().default('veecode-default'),
      },
      output: {
        syncResult: z =>
          z.string({
            description: 'Result message from the sync operation',
          }),
      },
    },
    async handler(ctx) {
      const { 
        kongConfigPath = 'kong.yaml',
        deckCommand = 'deck gateway sync',
        kongAddr,
        deckFlags = '',
        deckTag = 'veecode-default'
      } = ctx.input;
      
      ctx.logger.info('Starting Kong deck sync operation');
      if (kongAddr) {
        ctx.logger.info(`Using Kong Admin API at: ${kongAddr}`);
      } else {
        ctx.logger.info('Using deck default Kong Admin API address (from env vars like DECK_KONG_ADDR or defaults)');
      }

      // Validate deckTag to prevent command injection
      if (deckTag && !/^[a-zA-Z0-9._-]+$/.test(deckTag)) {
        throw new Error('Invalid tag format. Only alphanumeric characters, dots, hyphens, and underscores are allowed.');
      }

      // Validate deckFlags to prevent command injection - block shell metacharacters
      if (deckFlags && deckFlags.trim() !== '') {
        if (/[;|&$`()<>]/.test(deckFlags)) {
          throw new Error('deckFlags contains forbidden shell metacharacters (;|&$`()<>)');
        }
      }

      // Validate kongAddr to prevent command injection
      if (kongAddr && /[;|&$`()<>]/.test(kongAddr)) {
        throw new Error('kongAddr contains forbidden shell metacharacters (;|&$`()<>)');
      }

      try {
        // Resolve the Kong config file path
        const configPath = join(ctx.workspacePath, kongConfigPath);
        ctx.logger.info(`Kong configuration file: ${configPath}`);

        // Construct the deck command
        const tagFlag = deckTag ? `--select-tag ${deckTag}` : '';
        const addrFlag = kongAddr ? `--kong-addr ${kongAddr}` : '';
        const fullCommand = `${deckCommand} ${configPath} ${addrFlag} ${tagFlag} ${deckFlags}`.trim();
        
        ctx.logger.info(`Executing deck command: ${fullCommand}`);
        
        // Execute deck command
        try {
          const { stdout, stderr } = await execAsync(fullCommand);
          
          if (stdout) {
            ctx.logger.info(`deck stdout: ${stdout}`);
          }
          if (stderr) {
            ctx.logger.warn(`deck stderr: ${stderr}`);
          }

          const resultMessage = stdout || 'Sync completed successfully';
          ctx.output('syncResult', resultMessage);
          ctx.logger.info('Kong configuration synced successfully');

        } catch (error: any) {
          ctx.logger.error(`deck sync command failed: ${error.message}`);
          throw new Error(`Failed to execute deck sync command: ${error.message}`);
        }

      } catch (error: any) {
        ctx.logger.error(`Error syncing Kong configuration: ${error.message}`);
        throw error;
      }
    },
  });
}
