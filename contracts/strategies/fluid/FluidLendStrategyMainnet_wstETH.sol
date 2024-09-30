//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.26;
pragma experimental ABIEncoderV2;

import "./FluidLendStrategy.sol";

contract FluidLendStrategyMainnet_wstETH is FluidLendStrategy {

  constructor() {}

  function initializeStrategy(
    address _storage,
    address _vault
  ) public initializer {
    address underlying = address(0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0);
    address fToken = address(0x2411802D8BEA09be0aF8fD8D08314a63e706b29C);
    address weth = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    FluidLendStrategy.initializeBaseStrategy(
      _storage,
      underlying,
      _vault,
      fToken,
      weth
    );
  }
}