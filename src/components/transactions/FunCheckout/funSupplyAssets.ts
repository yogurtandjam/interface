import type { FunkitCheckoutConfig } from '@funkit/connect';
import { createAaveSupplyCheckoutConfig } from '@funkit/connect/clients/aave';
import { CustomMarket } from 'src/ui-config/marketsConfig';
import { type Address, getAddress } from 'viem';

/**
 * fun checkout only ships on the Core mainnet market. Gating on the market key
 * (not chainId) matters: mainnet hosts three markets (Core, Prime/Lido, EtherFi)
 * and e.g. USDC exists in all three with a different aToken and pool in each.
 * With the market pinned here, every address the reserve hands us (underlying,
 * aToken, pool) is consistent by construction.
 */
const FUN_SUPPLY_MARKET = CustomMarket.proto_mainnet_v3;

/**
 * The underlyings (lowercased) whose Supply button routes through funkit's
 * checkout modal instead of the native Aave supply modal.
 *
 * This map holds ONLY what the live reserve can't tell us:
 * - `aTokenSymbol`: the receipt token's REAL on-chain symbol (verified against
 *   `@aave-dao/aave-address-book/tokenlist`, Core pool, `aTokenV3` tag) — NOT a
 *   fabricated `a${symbol}`. Wallets validate `wallet_watchAsset` symbols against
 *   the contract, and dashboard reserve data only carries `aTokenAddress`.
 * - `iconSrc`: must be an absolute URL because it also feeds EIP-747's `image`,
 *   which the wallet fetches from its own context (the app's root-relative
 *   `/icons/...` paths don't resolve there — the native flow base64-encodes
 *   icons for the same reason).
 *
 * Everything else (symbol, decimals, addresses, APY, collateral state) comes from
 * the same market-scoped reserve data the native supply flow trusts to move funds.
 */
export const FUN_SUPPLY_ASSETS: {
  [underlyingAsset: string]: { aTokenSymbol: string; iconSrc: string };
} = {
  // cbBTC
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': {
    aTokenSymbol: 'aEthcbBTC',
    iconSrc: 'https://sdk-cdn.fun.xyz/images/cbbtc.svg',
  },
  // WBTC
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': {
    aTokenSymbol: 'aEthWBTC',
    iconSrc: 'https://sdk-cdn.fun.xyz/images/wbtc.svg',
  },
  // USDC
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
    aTokenSymbol: 'aEthUSDC',
    iconSrc: 'https://sdk-cdn.fun.xyz/images/usdc.svg',
  },
  // USDT
  '0xdac17f958d2ee523a2206206994597c13d831ec7': {
    aTokenSymbol: 'aEthUSDT',
    iconSrc: 'https://sdk-cdn.fun.xyz/images/usdt.svg',
  },
};

/** True when this market+asset's Supply button should open the funkit modal. */
export function isFunSupplyAsset(market: CustomMarket, underlyingAsset: string): boolean {
  return market === FUN_SUPPLY_MARKET && !!FUN_SUPPLY_ASSETS[underlyingAsset.toLowerCase()];
}

/**
 * Reserve snapshot the Supply button hands off when opening the fun modal.
 * All fields come from the clicked reserve / current market store — the same
 * sources the native supply flow uses.
 */
export type FunSupplyReserve = {
  underlyingAsset: string;
  symbol: string;
  decimals: number;
  /** aToken receipt address (Aave's `aTokenAddress`). */
  aTokenAddress: string;
  /** The market's pool (`currentMarketData.addresses.LENDING_POOL`). */
  poolAddress: string;
  /** Aave's `supplyAPY` — a 0–1 fraction string (e.g. "0.0283"). */
  supplyAPY: string | number;
  /** The user's collateral toggle for this reserve (`usageAsCollateralEnabledOnUser`). */
  collateralEnabled: boolean;
  chainId: number;
};

// Aave's supplyAPY is a 0–1 fraction; funkit's `display.supplyAPY` wants a
// percent string without the % sign (e.g. "2.83").
function toPercentString(apy: string | number): string {
  const fraction = Number(apy);
  if (!Number.isFinite(fraction)) {
    return '0';
  }
  return (fraction * 100).toFixed(2);
}

/**
 * Builds the per-asset funkit checkout config for a fun-supported supply asset.
 * The market gate lives at the click site (`useSupplyButtonAction`); this trusts
 * the vetted reserve and only returns `undefined` when the asset isn't in the
 * allowlist or the chain isn't fun-supported (createAaveSupplyCheckoutConfig's
 * own signal) — callers fall back to the native Aave supply flow in that case.
 */
export function buildFunSupplyConfig(
  reserve: FunSupplyReserve,
  walletAddress: Address | undefined
): FunkitCheckoutConfig | undefined {
  const asset = FUN_SUPPLY_ASSETS[reserve.underlyingAsset.toLowerCase()];
  if (!asset) {
    return undefined;
  }

  return createAaveSupplyCheckoutConfig({
    underlyingAsset: getAddress(reserve.underlyingAsset),
    poolAddress: getAddress(reserve.poolAddress),
    chainId: reserve.chainId,
    walletAddress,
    display: {
      symbol: reserve.symbol,
      supplyAPY: toPercentString(reserve.supplyAPY),
      collateralizationEnabled: reserve.collateralEnabled,
      iconSrc: asset.iconSrc,
    },
    receiptToken: {
      address: getAddress(reserve.aTokenAddress),
      symbol: asset.aTokenSymbol,
      decimals: reserve.decimals,
      iconSrc: asset.iconSrc,
    },
  });
}
