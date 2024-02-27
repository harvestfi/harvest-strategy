// SPDX-License-Identifier: Unlicense
pragma solidity 0.6.12;

interface IStakedAave {
function stake(address to, uint256 amount) external;

function redeem(address to, uint256 amount) external;

function cooldown() external;

function claimRewards(address to, uint256 amount) external;
function COOLDOWN_SECONDS() external view returns(uint256);
function UNSTAKE_WINDOW() external view returns(uint256);
function stakersCooldowns(address input) external view returns(uint256);
function stakerRewardsToClaim(address input) external view returns(uint256);
}
