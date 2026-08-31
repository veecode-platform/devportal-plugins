import { resolveProviderConfig, type ConfigLike } from './config';

/**
 * Minimal stand-in for the `auth.providers.ldap` subtree the auth backend hands
 * to a provider factory. Mirrors @backstage/config's Config for the three
 * methods the resolver uses, including `get()` with no key reading the whole
 * subtree.
 */
function subtree(data: Record<string, unknown>): ConfigLike {
    return {
        has: (key: string) => key in data,
        keys: () => Object.keys(data),
        get: (key?: string) => (key === undefined ? data : data[key]),
    };
}

const OPTIONS = {
    userSearchBase: 'ou=People,dc=vee,dc=codes',
    usernameAttribute: 'uid',
};

const AD_OPTIONS = {
    userSearchBase: 'ou=People,dc=vee,dc=codes',
    usernameAttribute: 'sAMAccountName',
};

describe('resolveProviderConfig', () => {
    it('reads options declared directly on the subtree, with no ramp', () => {
        const config = subtree({
            cookies: { field: 'backstage-token' },
            ldapAuthenticationOptions: OPTIONS,
        });

        expect(
            resolveProviderConfig(config, { nodeEnv: 'anything' })
                .ldapAuthenticationOptions
        ).toEqual(OPTIONS);
    });

    it('prefers the ramp matching NODE_ENV when several are declared', () => {
        const config = subtree({
            development: { ldapAuthenticationOptions: OPTIONS },
            production: { ldapAuthenticationOptions: AD_OPTIONS },
        });

        expect(
            resolveProviderConfig(config, { nodeEnv: 'development' })
                .ldapAuthenticationOptions
        ).toEqual(OPTIONS);
        expect(
            resolveProviderConfig(config, { nodeEnv: 'production' })
                .ldapAuthenticationOptions
        ).toEqual(AD_OPTIONS);
    });

    // The field regression: a preset declaring only `production` used to lose the
    // provider entirely whenever the pod's NODE_ENV was something else.
    it('uses the only declared ramp regardless of NODE_ENV', () => {
        const config = subtree({
            production: { ldapAuthenticationOptions: AD_OPTIONS },
        });

        for (const nodeEnv of ['development', 'staging', '', undefined]) {
            expect(
                resolveProviderConfig(config, { nodeEnv }).ldapAuthenticationOptions
            ).toEqual(AD_OPTIONS);
        }
    });

    it('falls back to production and warns when NODE_ENV matches no ramp', () => {
        const config = subtree({
            development: { ldapAuthenticationOptions: OPTIONS },
            production: { ldapAuthenticationOptions: AD_OPTIONS },
        });
        const warn = jest.fn();

        expect(
            resolveProviderConfig(config, { nodeEnv: 'staging', warn })
                .ldapAuthenticationOptions
        ).toEqual(AD_OPTIONS);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain("NODE_ENV='staging'");
        expect(warn.mock.calls[0][0]).toContain('development, production');
    });

    it('throws naming the declared ramps when none is usable', () => {
        const config = subtree({
            development: { ldapAuthenticationOptions: OPTIONS },
            staging: { ldapAuthenticationOptions: OPTIONS },
        });

        expect(() => resolveProviderConfig(config, { nodeEnv: 'test' })).toThrow(
            /declares \[development, staging\].*NODE_ENV='test'/s
        );
    });

    it('throws a usable message on an empty subtree', () => {
        expect(() =>
            resolveProviderConfig(subtree({}), { nodeEnv: 'production' })
        ).toThrow(/declares nothing/);
    });
});
