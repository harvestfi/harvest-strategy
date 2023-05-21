pragma solidity 0.5.16;

import "./VerseStrategy.sol";

contract VerseStrategyMainnet_VERSE_ETH is VerseStrategy {

  constructor() public {}

  function initializeStrategy(
    address _storage,
    address _vault
  ) public initializer {
    address underlying = address(0x845C0179060362f071FF5C7f1D2703617a480F3e);
    address rewardPool = address(0xDED0C22aCd80e7a4bd6eC91ced451Fc83f04cAB2);
    address verse = address(0x249cA82617eC3DfB2589c4c17ab7EC9765350a18);
    address weth = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
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
  }
}
