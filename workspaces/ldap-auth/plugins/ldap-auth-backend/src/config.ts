import type { BackstageLdapAuthConfiguration } from './types';

/**
 * The subset of @backstage/config's Config that resolveProviderConfig needs.
 * Declared locally so this module stays dependency-free and trivially testable
 * with a plain object.
 */
export type ConfigLike = {
    has(key: string): boolean;
    keys(): string[];
    /** Matches @backstage/config: key is optional, and omitting it reads the whole subtree. */
    get(key?: string): unknown;
};

/**
 * Options declared directly under `auth.providers.ldap`, with no environment
 * ramp. This is the shape a provider in the new backend system should use: the
 * factory only ever receives the `auth.providers.<id>` subtree
 * (plugin-auth-backend, providers/router.cjs.js), so there is no root config to
 * read an "environment" from in the first place.
 */
const RAMPLESS_MARKER = 'ldapAuthenticationOptions';

/**
 * Resolve the provider's configuration from the `auth.providers.ldap` subtree.
 *
 * History: this provider used to index the subtree by `process.env.NODE_ENV`,
 * falling back to the literal `'development'`. That coupled the config lookup to
 * how the pod happened to be launched rather than to what the config declared —
 * a deployment whose config declared only `production:` lost the provider
 * entirely whenever NODE_ENV was anything else. Because plugin-auth-backend
 * treats a provider that fails to build as non-fatal when
 * NODE_ENV === 'development' (it warns and installs a stub route that 404s), the
 * pod stayed healthy and every login failed with a message pointing at
 * credentials. Reported from the field, Aug 2026.
 *
 * `auth.environment` is deliberately NOT consulted, and cannot be: it is a root
 * key, while plugin-auth-backend hands a provider factory only the
 * `auth.providers.<id>` subtree (providers/router.cjs.js:
 * `config: providersConfig.getConfig(providerId)`). A host that does read it —
 * veecode-platform's own authProvidersModule.ts, for one — resolves it before
 * the factory runs; nothing of it reaches here. Upstream OAuth providers sidestep
 * the problem by picking their ramp per-request via
 * OAuthEnvironmentHandler.mapConfig, which has no analogue for a
 * username/password provider that is called directly by the frontend.
 *
 * Resolution order:
 *  1. Rampless — `ldapAuthenticationOptions` declared directly on the subtree.
 *  2. A ramp whose name equals `process.env.NODE_ENV` (preserves the previous
 *     behaviour for configs that relied on it).
 *  3. Exactly one ramp — use it regardless of NODE_ENV. This is what makes a
 *     `production`-only config work in a container that was launched with a
 *     different NODE_ENV.
 *  4. Several ramps and no NODE_ENV match — prefer `production`, and report it,
 *     because a deployed backend is the only thing this provider ever runs in.
 *  5. Otherwise throw, naming the ramps that are actually present.
 */
export function resolveProviderConfig(
    config: ConfigLike,
    opts: { nodeEnv?: string; warn?: (message: string) => void } = {}
): BackstageLdapAuthConfiguration {
    const { nodeEnv = process.env.NODE_ENV, warn } = opts;

    if (config.has(RAMPLESS_MARKER)) {
        return config.get() as BackstageLdapAuthConfiguration;
    }

    if (nodeEnv && config.has(nodeEnv)) {
        return config.get(nodeEnv) as BackstageLdapAuthConfiguration;
    }

    const ramps = config.keys();

    if (ramps.length === 1) {
        return config.get(ramps[0]) as BackstageLdapAuthConfiguration;
    }

    if (ramps.includes('production')) {
        warn?.(
            `ldap auth: no configuration for NODE_ENV='${
                nodeEnv ?? ''
            }' under auth.providers.ldap (available: ${ramps.join(
                ', '
            )}); using 'production'. Declare ldapAuthenticationOptions directly ` +
                `under auth.providers.ldap to drop the environment ramp entirely.`
        );
        return config.get('production') as BackstageLdapAuthConfiguration;
    }

    throw new Error(
        `ldap auth provider has no usable configuration: auth.providers.ldap ` +
            `declares ${
                ramps.length ? `[${ramps.join(', ')}]` : 'nothing'
            } and none matches NODE_ENV='${nodeEnv ?? ''}'. ` +
            `Declare ldapAuthenticationOptions directly under ` +
            `auth.providers.ldap, or add a '${nodeEnv ?? 'production'}' entry.`
    );
}
