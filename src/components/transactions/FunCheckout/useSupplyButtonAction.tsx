import { useModalContext } from 'src/hooks/useModal';
import { useRootStore } from 'src/store/root';

import { isFunSupplyAsset } from './funSupplyAssets';
import { beginFunSupply } from './funSupplyBridge';

/** Fields a Supply list item passes when its button is clicked. */
export type SupplyButtonReserve = {
  underlyingAsset: string;
  name: string;
  symbol: string;
  decimals: number;
  /** Aave's `supplyAPY` — a 0–1 fraction. */
  supplyAPY: string | number;
  aTokenAddress: string;
  /** `usageAsCollateralEnabledOnUser` from the reserve. */
  collateralEnabled: boolean;
};

/**
 * Returns the Supply button's click handler. For the allowlisted assets on the
 * Core mainnet market it opens the funkit checkout modal; for everything else it
 * falls back to the native Aave supply modal (`openSupply`). Shared by all 3
 * Supply list-item variants so the branch lives in one place.
 */
export function useSupplyButtonAction(): (reserve: SupplyButtonReserve) => void {
  const currentMarket = useRootStore((store) => store.currentMarket);
  const currentMarketData = useRootStore((store) => store.currentMarketData);
  const { openSupply } = useModalContext();

  return (reserve: SupplyButtonReserve) => {
    if (isFunSupplyAsset(currentMarket, reserve.underlyingAsset)) {
      const handled = beginFunSupply({
        underlyingAsset: reserve.underlyingAsset,
        symbol: reserve.symbol,
        decimals: reserve.decimals,
        aTokenAddress: reserve.aTokenAddress,
        poolAddress: currentMarketData.addresses.LENDING_POOL,
        supplyAPY: reserve.supplyAPY,
        collateralEnabled: reserve.collateralEnabled,
        chainId: currentMarketData.chainId,
      });
      if (handled) {
        return;
      }
      // funkit island hasn't mounted yet (ssr:false chunk still loading) —
      // fall through to the native modal instead of dropping the click.
    }
    openSupply(reserve.underlyingAsset, currentMarket, reserve.name, 'dashboard');
  };
}
