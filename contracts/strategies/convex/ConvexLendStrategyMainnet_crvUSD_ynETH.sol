// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.26;

import "./ConvexLendStrategy.sol";

contract ConvexLendStrategyMainnet_crvUSD_ynETH is ConvexLendStrategy {

  constructor() {}

  function initializeStrategy(
    address _storage,
    address _vault
  ) public initializer {
    address underlying = address(0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E);
    address lendingVault = address(0x52036c9046247C3358c987A2389FFDe6Ef8564c9);
    address rewardPool = address(0x726E52aBB10597E28D9Ad4C0969b1DfC31092b52);
    address crv = address(0xD533a949740bb3306d119CC777fa900bA034cd52);
    address cvx = address(0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B);
    ConvexLendStrategy.initializeBaseStrategy(
      _storage,
      underlying,
      _vault,
      lendingVault,
      rewardPool,
      crv,
      415
    );
    rewardTokens = [crv, cvx];
  }
}
