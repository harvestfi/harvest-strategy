//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.26;

interface ICurveDeposit_3token_stable {
  function add_liquidity(
    uint256[] calldata amounts,
    uint256 min_mint_amount
  ) external;
  function remove_liquidity_imbalance(
    uint256[] calldata amounts,
    uint256 max_burn_amount
  ) external;
  function remove_liquidity(
    uint256 _amount,
    uint256[] calldata amounts
  ) external;
}
