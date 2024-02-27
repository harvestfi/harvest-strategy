//SPDX-License-Identifier: Unlicense
pragma solidity 0.6.12;

interface IBalancerDex {
    function changeVault (address newVault) external;
    function changePoolId (address token0, address token1, bytes32 poolId) external;
}