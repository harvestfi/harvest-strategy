pragma solidity 0.5.16;

interface ISimpleFarm {
    function farmDeposit(uint256 _stakeAmount) external;
    function farmWithdraw(uint256 _withdrawAmount) external;
    function exitFarm() external;
    function claimReward() external;
    function stakeToken() external view returns(address);
    function rewardToken() external view returns(address);
    function balanceOf(address) external view returns(uint256);
    function earned(address) external view returns(uint256);
}
