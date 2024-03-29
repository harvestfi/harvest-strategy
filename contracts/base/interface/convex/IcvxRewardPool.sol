// SPDX-License-Identifier: Unlicense
pragma solidity 0.6.12;

interface IcvxRewardPool {
    function balanceOf(address account) external view returns(uint256 amount);
    function stakingToken() external view returns (address _stakingToken);
    function getReward(address, bool, bool) external;
    function stake(uint256 _amount) external;
    function stakeAll() external;
    function withdraw(uint256 amount, bool claim) external;
    function withdrawAll(bool claim) external;
}
