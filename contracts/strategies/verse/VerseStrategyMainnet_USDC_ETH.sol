pragma solidity 0.5.16;

import "./VerseStrategy.sol";

contract VerseStrategyMainnet_USDC_ETH is VerseStrategy {

  constructor() public {}

  function initializeStrategy(
    address _storage,
    address _vault
  ) public initializer {
    address underlying = address(0x6E1fbeeABA87BAe1100d95f8340dc27aD7C8427b);
    address rewardPool = address(0x4E1F1206f2B9a651EcF2D49C5d33761861D4910C);
    address verse = address(0x249cA82617eC3DfB2589c4c17ab7EC9765350a18);
    address weth = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address usdc = address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
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
    storedLiquidationPaths[verse][usdc] = [verse, usdc];
    storedLiquidationDexes[verse][usdc] = [sushiDex];
  }
}
