// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.26;

import "./ConvexStrategy.sol";

contract ConvexStrategyMainnet_cbBTC_WBTC is ConvexStrategy {

  constructor() {}

  function initializeStrategy(
    address _storage,
    address _vault
  ) public initializer {
    address underlying = address(0x839d6bDeDFF886404A6d7a788ef241e4e28F4802); // Info -> LP Token address
    address rewardPool = address(0xEd211Ec6F81f3516Ef6c5DFaC6CF09cD33A6Dff3); // Info -> Rewards contract address
    address crv = address(0xD533a949740bb3306d119CC777fa900bA034cd52);
    address cvx = address(0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B);
    address cbbtc = address(0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf);
    ConvexStrategy.initializeBaseStrategy(
      _storage,
      underlying,
      _vault,
      rewardPool, // rewardPool
      392,  // Pool id: Info -> Rewards contract address -> read -> pid
      cbbtc, // depositToken
      0, //depositArrayPosition. Find deposit transaction -> input params
      underlying, // deposit contract: usually underlying. Find deposit transaction -> interacted contract
      2, //nTokens -> total number of deposit tokens
      false, //metaPool -> if LP token address == pool address (at curve)
      true
    );
    rewardTokens = [crv, cvx];
  }
}
