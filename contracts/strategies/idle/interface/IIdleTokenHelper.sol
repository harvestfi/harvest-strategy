// SPDX-License-Identifier: Unlicense
pragma solidity 0.6.12;

interface IIdleTokenHelper {
  function getMintingPrice(address idleYieldToken) view external returns (uint256 mintingPrice);
  function getRedeemPrice(address idleYieldToken) view external returns (uint256 redeemPrice);
  function getRedeemPrice(address idleYieldToken, address user) view external returns (uint256 redeemPrice);
}
