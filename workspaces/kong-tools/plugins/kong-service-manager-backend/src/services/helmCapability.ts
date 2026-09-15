import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Result of probing whether the configured `helm` binary is usable. */
export interface HelmCapability {
  available: boolean;
  /** The path (or bare command) that was probed — `kong.promotion.helmPath`. */
  path: string;
  version?: string;
  /**
   * Present only when `available` is false. Already the full actionable
   * message — the same string surfaced in the 503 response and in the
   * frontend's disabled-Promote tooltip, so there's one place that writes it.
   */
  error?: string;
}

function describeUnavailable(helmPath: string): string {
  return (
    `promotion unavailable: helm not found at "${helmPath}" — the deployment ` +
    `must provide the helm CLI and point kong.promotion.helmPath at it (see README, "Prerequisites")`
  );
}

/** Runs `helm version --short` once against `helmPath` (design 02 helm-prerequisite follow-up, ADR-018). */
export async function probeHelm(
  helmPath: string,
  timeoutSeconds: number,
): Promise<HelmCapability> {
  try {
    const { stdout } = await execFileAsync(helmPath, ['version', '--short'], {
      timeout: timeoutSeconds * 1000,
    });
    return { available: true, path: helmPath, version: stdout.trim() };
  } catch {
    return { available: false, path: helmPath, error: describeUnavailable(helmPath) };
  }
}

/**
 * Holds the current helm capability and re-probes lazily — but only while
 * the last known state was unavailable, so a deployment that fixes the
 * prerequisite recovers without a backend restart, and a healthy helm isn't
 * re-checked on every gated request.
 */
export interface HelmCapabilityGate {
  getCapability(): Promise<HelmCapability>;
}

export function createHelmCapabilityGate(params: {
  helmPath: string;
  timeoutSeconds: number;
  initial: HelmCapability;
}): HelmCapabilityGate {
  let current = params.initial;
  return {
    async getCapability(): Promise<HelmCapability> {
      if (!current.available) {
        current = await probeHelm(params.helmPath, params.timeoutSeconds);
      }
      return current;
    },
  };
}
