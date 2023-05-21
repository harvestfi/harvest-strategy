pragma solidity 0.5.16;

import "./VerseStrategy.sol";

contract VerseStrategyMainnet_WBTC_ETH is VerseStrategy {

  constructor() public {}

  function initializeStrategy(
    address _storage,
    address _vault
  ) public initializer {
    address underlying = address(0xeaCADc656c9394fb09af25AeBc0897fDfFe484A1);
    address rewardPool = address(0x4efff28192029bdb1Ac027c53674721875DA6B10);
    address verse = address(0x249cA82617eC3DfB2589c4c17ab7EC9765350a18);
    address weth = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address wbtc = address(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599);
    bytes32 sushiDex = 0xcb2d20206d906069351c89a2cb7cdbd96c71998717cd5a82e724d955b654f67a;
    VerseStrategy.initializeBaseStrategy(
      _storage,
      underlying,
      _vault,
      rewardPool,
      verse,
      500 // 5% platform fee
    );
    storedLiquidationPaths[verse][weth] = [verse, weth];
    storedLiquidationDexes[verse][weth] = [sushiDex];
    storedLiquidationPaths[verse][wbtc] = [verse, wbtc];
    storedLiquidationDexes[verse][wbtc] = [sushiDex];
  }
}
