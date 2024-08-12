// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.26;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../base/interface/IVault.sol";
import "../../base/interface/IUniversalLiquidator.sol";
import "../../base/upgradability/BaseUpgradeableStrategy.sol";
import "../../base/interface/compound/IComet.sol";
import "../../base/interface/compound/ICometRewards.sol";

contract CompoundStrategy is BaseUpgradeableStrategy {

  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  address public constant harvestMSIG = address(0xF49440C1F012d041802b25A73e5B0B9166a75c02);

  // additional storage slots (on top of BaseUpgradeableStrategy ones) are defined here
  bytes32 internal constant _MARKET_SLOT = 0x7e894854bb2aa938fcac0eb9954ddb51bd061fc228fb4e5b8e859d96c06bfaa0;
  bytes32 internal constant _STORED_SUPPLIED_SLOT = 0x280539da846b4989609abdccfea039bd1453e4f710c670b29b9eeaca0730c1a2;

  constructor() BaseUpgradeableStrategy() {
    assert(_MARKET_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.market")) - 1));
    assert(_STORED_SUPPLIED_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.storedSupplied")) - 1));
  }

  function initializeBaseStrategy(
    address _storage,
    address _underlying,
    address _vault,
    address _market,
    address _rewardPool,
    address _rewardToken
  ) public initializer {

    BaseUpgradeableStrategy.initialize(
      _storage,
      _underlying,
      _vault,
      _rewardPool,
      _rewardToken,
      harvestMSIG
    );

    address _lpt = IComet(_market).baseToken();
    require(_lpt == _underlying, "Underlying mismatch");

    _setMarket(_market);
  }

  function currentSupplied() public view returns (uint256) {
    return IComet(market()).balanceOf(address(this));
  }

  function storedSupplied() public view returns (uint256) {
    return getUint256(_STORED_SUPPLIED_SLOT);
  }

  function _updateStoredSupplied(bool feeClaimed) internal {
    uint256 balance;
    if (feeClaimed) {
      balance = currentSupplied();
    } else {
      balance = currentSupplied().sub(pendingFee().mul(feeDenominator()).div(totalFeeNumerator()));
    }
    setUint256(_STORED_SUPPLIED_SLOT, balance);
  }

  function totalFeeNumerator() public view returns (uint256) {
    return strategistFeeNumerator().add(platformFeeNumerator()).add(profitSharingNumerator());
  }

  function pendingFee() public view returns (uint256) {
    uint256 fee;
    if (currentSupplied() > storedSupplied()) {
        uint256 balanceIncrease = currentSupplied().sub(storedSupplied());
        fee = balanceIncrease.mul(totalFeeNumerator()).div(feeDenominator());
    }
    return fee;
  }

  function depositArbCheck() public pure returns(bool) {
    return true;
  }

  function _emergencyExitRewardPool() internal {
    uint256 stakedBalance = currentSupplied();
    if (stakedBalance != 0) {
        _withdrawUnderlyingFromPool(stakedBalance);
    }
  }

  function _withdrawUnderlyingFromPool(uint256 amount) internal {
    IComet(market()).withdraw(underlying(), Math.min(currentSupplied(), amount));
  }

  function _enterRewardPool() internal {
    address underlying_ = underlying();
    address market_ = market();
    uint256 entireBalance = IERC20(underlying_).balanceOf(address(this));
    IERC20(underlying_).safeApprove(market_, 0);
    IERC20(underlying_).safeApprove(market_, entireBalance);
    IComet(market_).supply(underlying_, entireBalance);
  }

  function _investAllUnderlying() internal onlyNotPausedInvesting {
    // this check is needed, because most of the SNX reward pools will revert if
    // you try to stake(0).
    if(IERC20(underlying()).balanceOf(address(this)) > 0) {
      _enterRewardPool();
    }
    _updateStoredSupplied(true);
  }

  /*
  *   In case there are some issues discovered about the pool or underlying asset
  *   Governance can exit the pool properly
  *   The function is only used for emergency to exit the pool
  */
  function emergencyExit() public onlyGovernance {
    _emergencyExitRewardPool();
    _setPausedInvesting(true);
  }

  /*
  *   Resumes the ability to invest into the underlying reward pools
  */
  function continueInvesting() public onlyGovernance {
    _setPausedInvesting(false);
  }

  function unsalvagableTokens(address token) public view returns (bool) {
    return (token == rewardToken() || token == underlying() || token == market());
  }

  function _claimReward() internal {
    ICometRewards(rewardPool()).claim(market(), address(this), true);
  }

  function _liquidateReward() internal {
    if (!sell()) {
      // Profits can be disabled for possible simplified and rapid exit
      emit ProfitsNotCollected(sell(), false);
      return;
    }
    address _rewardToken = rewardToken();
    uint256 rewardBalance = IERC20(_rewardToken).balanceOf(address(this));
    uint256 _pendingFee = pendingFee();
    uint256 convertedFee;
    if (_pendingFee > 0) {
      address _underlying = underlying();
      uint256 underlyingBalance = IERC20(_underlying).balanceOf(address(this));
      address _universalLiquidator = universalLiquidator();
      if (underlyingBalance < _pendingFee) {
        _withdrawUnderlyingFromPool(_pendingFee.sub(underlyingBalance));
      }
      IERC20(_underlying).safeApprove(_universalLiquidator, 0);
      IERC20(_underlying).safeApprove(_universalLiquidator, _pendingFee);
      IUniversalLiquidator(_universalLiquidator).swap(_underlying, _rewardToken, _pendingFee, 1, address(this));
      uint256 rewardAfter = IERC20(_rewardToken).balanceOf(address(this));
      convertedFee = rewardAfter.sub(rewardBalance);
    }

    _notifyProfitInRewardToken(_rewardToken, rewardBalance.add(convertedFee.mul(feeDenominator()).div(totalFeeNumerator())));
    uint256 remainingRewardBalance = IERC20(_rewardToken).balanceOf(address(this));

    if (remainingRewardBalance == 0) {
      return;
    }

    address _underlying = underlying();
    if (_underlying != _rewardToken) {
      address _universalLiquidator = universalLiquidator();
      IERC20(_rewardToken).safeApprove(_universalLiquidator, 0);
      IERC20(_rewardToken).safeApprove(_universalLiquidator, remainingRewardBalance);
      IUniversalLiquidator(_universalLiquidator).swap(_rewardToken, _underlying, remainingRewardBalance, 1, address(this));
    }
  }

  /*
  *   Withdraws all the asset to the vault
  */
  function withdrawAllToVault() public restricted {
    _claimReward();
    _liquidateReward();
    _withdrawUnderlyingFromPool(currentSupplied());
    address underlying_ = underlying();
    IERC20(underlying_).safeTransfer(vault(), IERC20(underlying_).balanceOf(address(this)));
    _updateStoredSupplied(true);
  }

  /*
  *   Withdraws all the asset to the vault
  */
  function withdrawToVault(uint256 _amount) public restricted {
    // Typically there wouldn't be any amount here
    // however, it is possible because of the emergencyExit
    address underlying_ = underlying();
    uint256 entireBalance = IERC20(underlying_).balanceOf(address(this));

    if(_amount > entireBalance){
      // While we have the check above, we still using SafeMath below
      // for the peace of mind (in case something gets changed in between)
      uint256 needToWithdraw = _amount.sub(entireBalance);
      uint256 toWithdraw = Math.min(currentSupplied(), needToWithdraw);
      _withdrawUnderlyingFromPool(toWithdraw);
    }
    IERC20(underlying_).safeTransfer(vault(), _amount);
    _updateStoredSupplied(false);
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
    return IERC20(underlying()).balanceOf(address(this))
    .add(currentSupplied())
    .sub(pendingFee());
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
    _claimReward();
    _liquidateReward();
    _investAllUnderlying();
  }

  /**
  * Can completely disable claiming UNI rewards and selling. Good for emergency withdraw in the
  * simplest possible way.
  */
  function setSell(bool s) public onlyGovernance {
    _setSell(s);
  }

  function _setMarket(address _address) internal {
    setAddress(_MARKET_SLOT, _address);
  }

  function market() public view returns (address) {
    return getAddress(_MARKET_SLOT);
  }

  function finalizeUpgrade() external onlyGovernance {
    _finalizeUpgrade();
    _updateStoredSupplied(true);
  }
}
