//SPDX-License-Identifier: Unlicense
pragma solidity 0.6.12;

interface yERC20 {
  function deposit(uint256 _amount) external;
  function withdraw(uint256 _amount) external;
  function getPricePerFullShare() external view returns (uint256);
}
