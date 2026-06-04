/**
 * @jest-environment node
 *
 * (node, not the repo-default jsdom: the catalog imports viem, which needs
 * TextEncoder — a Node global that jsdom's environment doesn't expose.)
 */
import { AaveV3Ethereum } from '@aave-dao/aave-address-book';
import { execFileSync } from 'child_process';

// funSupplyAssets imports @funkit/connect/clients/aave (browser-only ESM) which
// jest can't parse and this test never exercises.
jest.mock('@funkit/connect/clients/aave', () => ({
  createAaveSupplyCheckoutConfig: jest.fn(),
}));

// eslint-disable-next-line import/first
import { FUN_SUPPLY_ASSETS } from '../funSupplyAssets';

type TokenlistEntry = {
  chainId: number;
  address: string;
  symbol: string;
  tags?: string[];
  extensions?: { pool?: string; underlying?: string };
};

/**
 * Loads the address-book tokenlist via a node subprocess. Direct import is
 * impossible under jest: the package's CJS artifact (dist/tokenlist.js) is
 * data-less — its only `module.exports` is esbuild's dead-code annotation
 * (`0 && (module.exports = ...)`) — and next/jest forbids transforming
 * node_modules, so the ESM artifact can't be loaded in-process either.
 */
function loadCoreATokens(): TokenlistEntry[] {
  const script = `
    import { tokens } from '@aave-dao/aave-address-book/tokenlist';
    const core = tokens.filter(
      (t) =>
        t.chainId === 1 &&
        t.extensions?.pool === '${AaveV3Ethereum.POOL}' &&
        t.tags?.includes('aTokenV3')
    );
    console.log(JSON.stringify(core));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      cwd: process.cwd(),
    })
  );
}

/**
 * FUN_SUPPLY_ASSETS hardcodes each receipt token's on-chain symbol because the
 * dashboard reserve data only carries `aTokenAddress`, and importing the
 * tokenlist at runtime would ship its full ~900-entry array to the client for
 * 4 strings. This test pins the catalog to the address book instead, so an
 * address-book bump that changes an aToken symbol (or a typo in the catalog)
 * fails CI rather than breaking the wallet_watchAsset flow (wallets validate
 * the submitted symbol against the contract).
 */
describe('FUN_SUPPLY_ASSETS', () => {
  const coreATokens = loadCoreATokens();

  it.each(Object.entries(FUN_SUPPLY_ASSETS))(
    'aTokenSymbol for %s matches the address-book tokenlist',
    (underlyingAsset, asset) => {
      const tokenlistEntry = coreATokens.find(
        (t) => t.extensions?.underlying?.toLowerCase() === underlyingAsset
      );
      expect(tokenlistEntry).toBeDefined();
      expect(asset.aTokenSymbol).toBe(tokenlistEntry?.symbol);
    }
  );

  it('keys are lowercased (the gate lowercases its input before lookup)', () => {
    for (const key of Object.keys(FUN_SUPPLY_ASSETS)) {
      expect(key).toBe(key.toLowerCase());
    }
  });
});
