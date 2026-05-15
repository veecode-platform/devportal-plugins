import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { Config } from '@backstage/config';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join, resolve, relative, normalize, dirname } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

const execAsync = promisify(exec);

/**
 * Creates a `veecode:kong:deck:generate` Scaffolder action.
 *
 * @remarks
 *
 * This action uses the deck CLI tool to convert an OpenAPI specification
 * into a Kong declarative configuration YAML file.
 *
 * @public
 */
export function createDeckGenerateAction(options: { config: Config }) {
  return createTemplateAction({
    id: 'veecode:kong:deck:generate',
    description: 'Generates a Kong YAML configuration from an OpenAPI specification using deck',
    schema: {
      input: {
        openapiSpec: z =>
          z.string({
            description: 'The OpenAPI specification content (YAML or JSON string)',
          }),
        outputPath: z =>
          z.string({
            description: 'The output path for the generated Kong YAML file (relative to workspace)',
          }).optional().default('kong.yaml'),
        deckCommand: z =>
          z.string({
            description: 'The deck command to run',
          }).optional().default('deck file openapi2kong'),
        deckFlags: z =>
          z.string({
            description: 'Additional flags to pass to deck command',
          }).optional().default(''),
        deckTag: z =>
          z.string({
            description: 'Tag to filter Kong entities (passed to --select-tag)',
          }).optional(),
        removePathEOLAnchor: z =>
          z.boolean({
            description: 'Remove trailing $ (end-of-line anchor) from route paths',
          }).optional().default(false),
      },
      output: {
        kongConfigPath: z =>
          z.string({
            description: 'The path to the generated Kong configuration file',
          }),
      },
    },
    async handler(ctx) {
      const { 
        openapiSpec, 
        outputPath = 'kong.yaml', 
        deckCommand = 'deck file openapi2kong', 
        deckFlags = '',
        deckTag,
        removePathEOLAnchor = false
      } = ctx.input;
      
      // Validate deckCommand to prevent command injection
      // Read allowed commands from config or use default
      const ALLOWED_DECK_COMMANDS = options.config.getOptionalStringArray(
        'scaffolder.actions.veecode.kong.deck.allowedCommands'
      ) ?? ['deck file openapi2kong'];
      
      if (!ALLOWED_DECK_COMMANDS.includes(deckCommand)) {
        throw new Error(`Invalid deck command. Allowed commands: ${ALLOWED_DECK_COMMANDS.join(', ')}`);
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

      // Validate outputPath to prevent path traversal
      const normalizedOutputPath = normalize(outputPath);
      
      // Check for absolute paths
      if (resolve(normalizedOutputPath) === normalizedOutputPath) {
        throw new Error('Output path must be relative, not absolute');
      }
      
      // Check for path traversal attempts
      if (normalizedOutputPath.startsWith('..') || normalizedOutputPath.includes('/../')) {
        throw new Error('Output path must not contain path traversal sequences (..)');
      }
      
      // Verify the final resolved path is within workspace
      const resolvedOutputPath = resolve(ctx.workspacePath, normalizedOutputPath);
      const relativePath = relative(ctx.workspacePath, resolvedOutputPath);
      
      if (relativePath.startsWith('..') || resolve(ctx.workspacePath, relativePath) !== resolvedOutputPath) {
        throw new Error('Output path must be within the workspace directory');
      }
      
      ctx.logger.info('Starting Kong deck generation from OpenAPI spec');

      // Generate a unique temporary file name for the OpenAPI spec
      const tempId = randomBytes(16).toString('hex');
      const tempInputPath = join(tmpdir(), `openapi-${tempId}.yaml`);
      const tempOutputPath = join(tmpdir(), `kong-${tempId}.yaml`);

      try {
        // Write the OpenAPI spec to a temporary file
        ctx.logger.info(`Writing OpenAPI spec to temporary file: ${tempInputPath}`);
        await writeFile(tempInputPath, openapiSpec, 'utf-8');

        // Construct the deck command
        const tagFlag = deckTag ? `--select-tag ${deckTag}` : '';
        const fullCommand = `${deckCommand} -s ${tempInputPath} -o ${tempOutputPath} ${tagFlag} ${deckFlags}`.trim();
        
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
        } catch (error: any) {
          ctx.logger.error(`deck command failed: ${error.message}`);
          throw new Error(`Failed to execute deck command: ${error.message}`);
        }

        // Ensure the output directory exists
        const finalOutputPath = join(ctx.workspacePath, normalizedOutputPath);
        const outputDir = dirname(finalOutputPath);
        await mkdir(outputDir, { recursive: true });

        // Copy the generated Kong YAML to the workspace
        ctx.logger.info(`Copying Kong configuration to: ${finalOutputPath}`);
        
        // Read the generated file and write to workspace
        const { readFile } = await import('fs/promises');
        let kongConfig = await readFile(tempOutputPath, 'utf-8');
        
        // Remove end-of-line anchors if requested
        if (removePathEOLAnchor) {
          ctx.logger.info('Removing end-of-line anchors ($) from route paths');
          kongConfig = kongConfig.replace(/([:\s-])(["']?)([^"'\s]*?)\$\2/g, '$1$2$3$2');
        }
        
        await writeFile(finalOutputPath, kongConfig, 'utf-8');

        ctx.logger.info('Kong YAML configuration generated successfully');
        ctx.logger.info('Generated Kong configuration:');
        ctx.logger.info(kongConfig);

        // Set output
        ctx.output('kongConfigPath', normalizedOutputPath);

      } catch (error: any) {
        ctx.logger.error(`Error generating Kong configuration: ${error.message}`);
        throw error;
      } finally {
        // Clean up temporary files
        try {
          await unlink(tempInputPath).catch(() => {});
          await unlink(tempOutputPath).catch(() => {});
        } catch {
          // Ignore cleanup errors
        }
      }
    },
  });
}
