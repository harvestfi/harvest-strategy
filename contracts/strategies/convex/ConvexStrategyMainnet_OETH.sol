// SPDX-License-Identifier: Unlicense
pragma solidity 0.6.12;

import "./base/ConvexStrategyUL_V2.sol";

contract ConvexStrategyMainnet_OETH is ConvexStrategyUL_V2 {

  constructor() public {}

  function initializeStrategy(
    address _storage,
    address _vault
  ) public initializer {
    address underlying = address(0x94B17476A93b3262d87B9a326965D1E91f9c13E7); // Info -> LP Token address
    address rewardPool = address(0x24b65DC1cf053A8D96872c323d29e86ec43eB33A); // Info -> Rewards contract address
    address crv = address(0xD533a949740bb3306d119CC777fa900bA034cd52);
    address cvx = address(0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B);
    ConvexStrategyUL_V2.initializeBaseStrategy(
      _storage,
      underlying,
      _vault,
      rewardPool, // rewardPool
      174,  // Pool id: Info -> Rewards contract address -> read -> pid
      weth, // depositToken
      0, //depositArrayPosition. Find deposit transaction -> input params
      underlying, // deposit contract: usually underlying. Find deposit transaction -> interacted contract
      2, //nTokens -> total number of deposit tokens
      false //metaPool -> if LP token address == pool address (at curve)
    );
    rewardTokens = [crv, cvx];
  }
}
