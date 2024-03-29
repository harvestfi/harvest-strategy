// SPDX-License-Identifier: Unlicense
pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../base/interface/uniswap/IUniswapV2Router02.sol";
import "../../base/interface/IVault.sol";
import "../../base/interface/IUniversalLiquidator.sol";
import "../../base/upgradability/BaseUpgradeableStrategy.sol";
import "../../base/interface/sushi/IMasterChef.sol";
import "../../base/interface/uniswap/IUniswapV2Pair.sol";

contract YelStrategy is BaseUpgradeableStrategy {

  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  address public constant uniswapRouterV2 = address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
  address public constant sushiswapRouterV2 = address(0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F);
  address public constant multiSigAddr = address(0xF49440C1F012d041802b25A73e5B0B9166a75c02);

  // additional storage slots (on top of BaseUpgradeableStrategy ones) are defined here
  bytes32 internal constant _POOLID_SLOT = 0x3fd729bfa2e28b7806b03a6e014729f59477b530f995be4d51defc9dad94810b;
  bytes32 internal constant _USE_UNI_SLOT = 0x1132c1de5e5b6f1c4c7726265ddcf1f4ae2a9ecf258a0002de174248ecbf2c7a;
  bytes32 internal constant _IS_LP_ASSET_SLOT = 0xc2f3dabf55b1bdda20d5cf5fcba9ba765dfc7c9dbaf28674ce46d43d60d58768;

  constructor() public BaseUpgradeableStrategy() {
    assert(_POOLID_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.poolId")) - 1));
  }

  function initializeStrategy(
    address _storage,
    address _underlying,
    address _vault,
    address _rewardPool,
    address _rewardToken,
    uint256 _poolID,
    bool _isLpAsset,
    bool _useUni
  ) public initializer {

    BaseUpgradeableStrategy.initialize(
      _storage,
      _underlying,
      _vault,
      _rewardPool,
      _rewardToken,
      multiSigAddr
    );

    address _lpt;
    (_lpt,,,) = IMasterChef(rewardPool()).poolInfo(_poolID);
    require(_lpt == underlying(), "Pool Info does not match underlying");
    _setPoolId(_poolID);
    setBoolean(_USE_UNI_SLOT, _useUni);
    setBoolean(_IS_LP_ASSET_SLOT, _isLpAsset);
  }

  function depositArbCheck() public pure returns(bool) {
    return true;
  }

  function rewardPoolBalance() internal view returns (uint256 bal) {
      (bal,) = IMasterChef(rewardPool()).userInfo(poolId(), address(this));
  }

  function exitRewardPool() internal {
      uint256 bal = rewardPoolBalance();
      if (bal != 0) {
          IMasterChef(rewardPool()).withdraw(poolId(), bal);
      }
  }

  function emergencyExitRewardPool() internal {
      uint256 bal = rewardPoolBalance();
      if (bal != 0) {
          IMasterChef(rewardPool()).emergencyWithdraw(poolId());
      }
  }

  function unsalvagableTokens(address token) public view returns (bool) {
    return (token == rewardToken() || token == underlying());
  }

  function enterRewardPool() internal {
    uint256 entireBalance = IERC20(underlying()).balanceOf(address(this));
    IERC20(underlying()).safeApprove(rewardPool(), 0);
    IERC20(underlying()).safeApprove(rewardPool(), entireBalance);
    IMasterChef(rewardPool()).deposit(poolId(), entireBalance);
  }

  /*
  *   In case there are some issues discovered about the pool or underlying asset
  *   Governance can exit the pool properly
  *   The function is only used for emergency to exit the pool
  */
  function emergencyExit() public onlyGovernance {
    emergencyExitRewardPool();
    _setPausedInvesting(true);
  }

  /*
  *   Resumes the ability to invest into the underlying reward pools
  */

  function continueInvesting() public onlyGovernance {
    _setPausedInvesting(false);
  }

  // We assume that all the tradings can be done on Uniswap
  function _liquidateReward() internal {
    address _rewardToken = rewardToken();
    address _universalLiquidator = universalLiquidator();
    uint256 rewardBalanceBefore = IERC20(_rewardToken).balanceOf(address(this));
    IMasterChef(_rewardToken).withdraw(poolId(), 0);
    uint256 rewardBalanceAfter = IERC20(_rewardToken).balanceOf(address(this));
    uint256 claimed = rewardBalanceAfter.sub(rewardBalanceBefore);

    if (!sell() || claimed < sellFloor()) {
      // Profits can be disabled for possible simplified and rapid exit
      emit ProfitsNotCollected(sell(), claimed < sellFloor());
      return;
    }

    _notifyProfitInRewardToken(_rewardToken, claimed);
    uint256 remainingRewardBalance = IERC20(_rewardToken).balanceOf(address(this));

    if (remainingRewardBalance == 0) {
      return;
    }

    address _underlying = underlying();
    if(_underlying != _rewardToken) {
      if (isLpAsset()) {
        address uniLPComponentToken0 = IUniswapV2Pair(_underlying).token0();
        address uniLPComponentToken1 = IUniswapV2Pair(_underlying).token1();

        uint256 toToken0 = remainingRewardBalance.div(2);
        uint256 toToken1 = remainingRewardBalance.sub(toToken0);

        uint256 token0Amount;
        uint256 token1Amount;

        if (_rewardToken != uniLPComponentToken0) {
          IERC20(_rewardToken).safeApprove(_universalLiquidator, 0);
          IERC20(_rewardToken).safeApprove(_universalLiquidator, toToken0);
          IUniversalLiquidator(_universalLiquidator).swap(_rewardToken, uniLPComponentToken0, toToken0, 1, address(this));
          token0Amount = IERC20(uniLPComponentToken0).balanceOf(address(this));
        } else {
          // otherwise we assme token0 is the reward token itself
          token0Amount = toToken0;
        }

        if (_rewardToken != uniLPComponentToken1) {
          IERC20(_rewardToken).safeApprove(_universalLiquidator, 0);
          IERC20(_rewardToken).safeApprove(_universalLiquidator, toToken1);
          IUniversalLiquidator(_universalLiquidator).swap(_rewardToken, uniLPComponentToken1, toToken1, 1, address(this));
          token1Amount = IERC20(uniLPComponentToken1).balanceOf(address(this));
        } else {
          // otherwise we assme token0 is the reward token itself
          token1Amount = toToken1;
        }
 
        address routerV2;
        if(useUni()) {
          routerV2 = uniswapRouterV2;
        } else {
          routerV2 = sushiswapRouterV2;
        }

        // provide token1 and token2 to SUSHI
        IERC20(uniLPComponentToken0).safeApprove(routerV2, 0);
        IERC20(uniLPComponentToken0).safeApprove(routerV2, token0Amount);

        IERC20(uniLPComponentToken1).safeApprove(routerV2, 0);
        IERC20(uniLPComponentToken1).safeApprove(routerV2, token1Amount);

        // we provide liquidity to sushi
        uint256 liquidity;
        (,,liquidity) = IUniswapV2Router02(routerV2).addLiquidity(
          uniLPComponentToken0,
          uniLPComponentToken1,
          token0Amount,
          token1Amount,
          1,  // we are willing to take whatever the pair gives us
          1,  // we are willing to take whatever the pair gives us
          address(this),
          block.timestamp
        );
      } else {
        IERC20(_rewardToken).safeApprove(_universalLiquidator, 0);
        IERC20(_rewardToken).safeApprove(_universalLiquidator, remainingRewardBalance);
        IUniversalLiquidator(_universalLiquidator).swap(_rewardToken, _underlying, remainingRewardBalance, 1, address(this));
      }
    }
  }

  /*
  *   Stakes everything the strategy holds into the reward pool
  */
  function investAllUnderlying() internal onlyNotPausedInvesting {
    // this check is needed, because most of the SNX reward pools will revert if
    // you try to stake(0).
    if(IERC20(underlying()).balanceOf(address(this)) > 0) {
      enterRewardPool();
    }
  }

  /*
  *   Withdraws all the asset to the vault
  */
  function withdrawAllToVault() public restricted {
    if (address(rewardPool()) != address(0)) {
      exitRewardPool();
    }
    IERC20(underlying()).safeTransfer(vault(), IERC20(underlying()).balanceOf(address(this)));
  }

  /*
  *   Withdraws all the asset to the vault
  */
  function withdrawToVault(uint256 amount) public restricted {
    // Typically there wouldn't be any amount here
    // however, it is possible because of the emergencyExit
    uint256 entireBalance = IERC20(underlying()).balanceOf(address(this));

    if(amount > entireBalance){
      // While we have the check above, we still using SafeMath below
      // for the peace of mind (in case something gets changed in between)
      uint256 needToWithdraw = amount.sub(entireBalance);
      uint256 toWithdraw = Math.min(rewardPoolBalance(), needToWithdraw);
      IMasterChef(rewardPool()).withdraw(poolId(), toWithdraw);
    }

    IERC20(underlying()).safeTransfer(vault(), amount);
  }

  /*
  *   Note that we currently do not have a mechanism here to include the
  *   amount of reward that is accrued.
  */
  function investedUnderlyingBalance() external view returns (uint256) {
    if (rewardPool() == address(0)) {
      return IERC20(underlying()).balanceOf(address(this));
    }
    // Adding the amount locked in the reward pool and the amount that is somehow in this contract
    // both are in the units of "underlying"
    // The second part is needed because there is the emergency exit mechanism
    // which would break the assumption that all the funds are always inside of the reward pool
    return rewardPoolBalance().add(IERC20(underlying()).balanceOf(address(this)));
  }

  /*
  *   Governance or Controller can claim coins that are somehow transferred into the contract
  *   Note that they cannot come in take away coins that are used and defined in the strategy itself
  */
  function salvage(address recipient, address token, uint256 amount) external onlyControllerOrGovernance {
     // To make sure that governance cannot come in and take away the coins
    require(!unsalvagableTokens(token), "token is defined as not salvagable");
    IERC20(token).safeTransfer(recipient, amount);
  }

  /*
  *   Get the reward, sell it in exchange for underlying, invest what you got.
  *   It's not much, but it's honest work.
  *
  *   Note that although `onlyNotPausedInvesting` is not added here,
  *   calling `investAllUnderlying()` affectively blocks the usage of `doHardWork`
  *   when the investing is being paused by governance.
  */
  function doHardWork() external onlyNotPausedInvesting restricted {
    _liquidateReward();
    investAllUnderlying();
  }

  /**
  * Can completely disable claiming UNI rewards and selling. Good for emergency withdraw in the
  * simplest possible way.
  */
  function setSell(bool s) public onlyGovernance {
    _setSell(s);
  }

  /**
  * Sets the minimum amount of CRV needed to trigger a sale.
  */
  function setSellFloor(uint256 floor) public onlyGovernance {
    _setSellFloor(floor);
  }

  // masterchef rewards pool ID
  function _setPoolId(uint256 _value) internal {
    setUint256(_POOLID_SLOT, _value);
  }

  function poolId() public view returns (uint256) {
    return getUint256(_POOLID_SLOT);
  }

  function setUseUni(bool _value) public onlyGovernance {
    setBoolean(_USE_UNI_SLOT, _value);
  }

  function useUni() public view returns (bool) {
    return getBoolean(_USE_UNI_SLOT);
  }

  function isLpAsset() public view returns (bool) {
    return getBoolean(_IS_LP_ASSET_SLOT);
  }
}
