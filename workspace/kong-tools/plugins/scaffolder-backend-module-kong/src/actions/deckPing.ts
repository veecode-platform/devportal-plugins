import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { Config } from '@backstage/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolveKongInstance } from './kongConfig';

const execAsync = promisify(exec);

/**
 * Creates a `veecode:kong:deck:ping` Scaffolder action.
 *
 * @remarks
 *
 * This action uses the deck CLI tool to ping a Kong Gateway control plane
 * to verify connectivity using existing environment variables.
 *
 * @public
 */
export function createDeckPingAction(options: { config: Config }) {
  return createTemplateAction({
    id: 'veecode:kong:deck:ping',
    description: 'Tests connectivity to Kong Gateway control plane using deck gateway ping',
    schema: {
      input: {
        kongInstance: z =>
          z.string({
            description: 'Kong instance ID from kong.instances config (takes priority over kongAddr)',
          }).optional(),
        kongAddr: z =>
          z.string({
            description: 'Kong Admin API address (if not provided, deck uses env vars like DECK_KONG_ADDR)',
          }).optional(),
        deckFlags: z =>
          z.string({
            description: 'Additional flags to pass to deck gateway ping command',
          }).optional().default(''),
      },
      output: {
        pingResult: z =>
          z.string({
            description: 'Result message from the ping operation',
          }),
        connectionSuccess: z =>
          z.boolean({
            description: 'Whether the connection to Kong control plane was successful',
          }),
      },
    },
    async handler(ctx) {
      const {
        kongInstance,
        kongAddr,
        deckFlags = ''
      } = ctx.input;

      ctx.logger.info('Starting Kong deck ping operation');

      // Resolve Kong connection: kongInstance > kongAddr > env vars
      let resolvedAddr = kongAddr;
      let resolvedHeaders = '';

      if (kongInstance) {
        const resolved = resolveKongInstance(options.config, kongInstance);
        resolvedAddr = resolved.kongAddr;
        resolvedHeaders = resolved.headers;
        ctx.logger.info(`Resolved Kong instance '${kongInstance}' → ${resolvedAddr}`);
      } else if (resolvedAddr) {
        ctx.logger.info(`Testing connection to Kong Admin API at: ${resolvedAddr}`);
      } else {
        ctx.logger.info('Testing connection using deck default Kong Admin API address (from env vars like DECK_KONG_ADDR)');
      }

      // Validate deckFlags to prevent command injection - block shell metacharacters
      if (deckFlags && deckFlags.trim() !== '') {
        if (/[;|&$`()<>]/.test(deckFlags)) {
          throw new Error('deckFlags contains forbidden shell metacharacters (;|&$`()<>)');
        }
      }

      // Validate kongAddr to prevent command injection
      if (resolvedAddr && /[;|&$`()<>]/.test(resolvedAddr)) {
        throw new Error('kongAddr contains forbidden shell metacharacters (;|&$`()<>)');
      }

      try {
        // Construct the deck command
        const addrFlag = resolvedAddr ? `--kong-addr ${resolvedAddr}` : '';
        const headersFlag = resolvedHeaders ? `--headers "${resolvedHeaders}"` : '';
        const fullCommand = `deck gateway ping ${addrFlag} ${headersFlag} ${deckFlags}`.trim();
        
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

          const resultMessage = stdout || 'Ping completed successfully - Connection to Kong control plane is working';
          ctx.output('pingResult', resultMessage);
          ctx.output('connectionSuccess', true);
          ctx.logger.info('✅ Successfully connected to Kong control plane');

        } catch (error: any) {
          ctx.logger.error(`deck ping command failed: ${error.message}`);
          
          // Build detailed error message with troubleshooting guidance
          const troubleshootingGuide = [
            'Failed to connect to Kong control plane.',
            '',
            'Possible causes:',
            '1. Kong Admin API is not accessible from this environment',
            '2. Missing or incorrect environment variables:',
            '   - DECK_KONG_ADDR (e.g., "http://kong-admin:8001")',
            '   - DECK_HEADERS (e.g., "Kong-Admin-Token:your-token")',
            '   - Or for Konnect: DECK_KONNECT_TOKEN, DECK_KONNECT_CONTROL_PLANE_NAME',
            '3. Network connectivity issues or firewall blocking access',
            '4. Kong Gateway is not running or not responding',
            '',
            `Error details: ${error.message}`,
          ].join('\n');
          
          ctx.logger.error(troubleshootingGuide);
          
          // Output the failure result
          ctx.output('pingResult', troubleshootingGuide);
          ctx.output('connectionSuccess', false);
          
          throw new Error(troubleshootingGuide);
        }

      } catch (error: any) {
        ctx.logger.error(`Error pinging Kong control plane: ${error.message}`);
        throw error;
      }
    },
  });
}
