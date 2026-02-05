//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.26;

import "./AuraV3Strategy.sol";

contract AuraV3StrategyMainnet_RZR_wstETH is AuraV3Strategy {

  constructor() {}

  function initializeStrategy(
    address _storage,
    address _vault
  ) public initializer {
    address underlying = address(0xF2d8ad2984aA8050dD1CA1e74b862b165f7a622A);
    address aura = address(0xC0c293ce456fF0ED870ADd98a0828Dd4d2903DBF);
    address bal = address(0xba100000625a3754423978a60c9317c58a424e3D);
    address rzr = address(0xb4444468e444f89e1c2CAc2F1D3ee7e336cBD1f5);
    address rewardPool = address(0x0b1684F09be67408e37787aBa3A050d6799fe9ce);
    AuraV3Strategy.initializeBaseStrategy(
      _storage,
      underlying,
      _vault,
      rewardPool,
      268,      // Aura Pool id
      rzr   //depositToken
    );
    rewardTokens = [aura, bal, rzr];
  }
}
