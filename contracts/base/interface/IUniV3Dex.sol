//SPDX-License-Identifier: Unlicense
pragma solidity 0.6.12;

interface IUniV3Dex {
    function setFee(address token0, address token1, uint24 fee) external;
}