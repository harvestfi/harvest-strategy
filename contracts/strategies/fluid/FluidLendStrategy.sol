// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.26;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../base/interface/IUniversalLiquidator.sol";
import "../../base/upgradability/BaseUpgradeableStrategy.sol";
import "../../base/interface/IERC4626.sol";
import "../../base/interface/fluid/IFluidMerkleDistributor.sol";

contract FluidLendStrategy is BaseUpgradeableStrategy {

  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  address public constant weth = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
  address public constant harvestMSIG = address(0xF49440C1F012d041802b25A73e5B0B9166a75c02);

  // additional storage slots (on top of BaseUpgradeableStrategy ones) are defined here
  bytes32 internal constant _FTOKEN_SLOT = 0x462e4d44c9bae3e0ee3d71929710bef82ca7c929ce31980e75572ea415835b0e;
  bytes32 internal constant _STORED_SUPPLIED_SLOT = 0x280539da846b4989609abdccfea039bd1453e4f710c670b29b9eeaca0730c1a2;
  bytes32 internal constant _PENDING_FEE_SLOT = 0x0af7af9f5ccfa82c3497f40c7c382677637aee27293a6243a22216b51481bd97;

  // this would be reset on each upgrade
  address[] public rewardTokens;

  constructor() BaseUpgradeableStrategy() {
    assert(_FTOKEN_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.fToken")) - 1));
    assert(_STORED_SUPPLIED_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.storedSupplied")) - 1));
    assert(_PENDING_FEE_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.pendingFee")) - 1));
  }

  function initializeBaseStrategy(
    address _storage,
    address _underlying,
    address _vault,
    address _fToken,
    address _rewardToken
  )
  public initializer {
    BaseUpgradeableStrategy.initialize(
      _storage,
      _underlying,
      _vault,
      _fToken,
      _rewardToken,
      harvestMSIG
    );

    require(IERC4626(_fToken).asset() == _underlying, "Underlying mismatch");
    _setFToken(_fToken);
  }

  function currentBalance() public view returns (uint256) {
    address _fToken = fToken();
    uint256 underlyingBalance = IERC4626(_fToken).previewRedeem(IERC20(_fToken).balanceOf(address(this)));
    return underlyingBalance;
  }

  function storedBalance() public view returns (uint256) {
    return getUint256(_STORED_SUPPLIED_SLOT);
  }

  function _updateStoredBalance() internal {
    uint256 balance = currentBalance();
    setUint256(_STORED_SUPPLIED_SLOT, balance);
  }

  function totalFeeNumerator() public view returns (uint256) {
    return strategistFeeNumerator().add(platformFeeNumerator()).add(profitSharingNumerator());
  }

  function pendingFee() public view returns (uint256) {
    return getUint256(_PENDING_FEE_SLOT);
  }

  function _accrueFee() internal {
    uint256 fee;
    if (currentBalance() > storedBalance()) {
      uint256 balanceIncrease = currentBalance().sub(storedBalance());
      fee = balanceIncrease.mul(totalFeeNumerator()).div(feeDenominator());
    }
    setUint256(_PENDING_FEE_SLOT, pendingFee().add(fee));
    _updateStoredBalance();
  }

  function _handleFee() internal {
    _accrueFee();
    uint256 fee = pendingFee();
    if (fee > 0) {
      uint256 balanceIncrease = fee.mul(feeDenominator()).div(totalFeeNumerator());
      _redeem(fee);
      address _underlying = underlying();
      if (IERC20(_underlying).balanceOf(address(this)) < fee) {
        balanceIncrease = IERC20(_underlying).balanceOf(address(this)).mul(feeDenominator()).div(totalFeeNumerator());
      }
      _notifyProfitInRewardToken(_underlying, balanceIncrease);
      setUint256(_PENDING_FEE_SLOT, 0);
    }
  }

  function depositArbCheck() public pure returns (bool) {
    // there's no arb here.
    return true;
  }

  function unsalvagableTokens(address token) public view returns (bool) {
    return (token == rewardToken() || token == underlying());
  }

  /**
  * The strategy invests by supplying the underlying as a collateral.
  */
  function _investAllUnderlying() internal onlyNotPausedInvesting {
    address _underlying = underlying();
    uint256 underlyingBalance = IERC20(_underlying).balanceOf(address(this));
    if (underlyingBalance > 1e1) {
      _supply(underlyingBalance);
    }
  }

  /**
  * Exits Moonwell and transfers everything to the vault.
  */
  function withdrawAllToVault() public restricted {
    _liquidateRewards();
    address _underlying = underlying();
    _redeemAll();
    if (IERC20(_underlying).balanceOf(address(this)) > 0) {
      IERC20(_underlying).safeTransfer(vault(), IERC20(_underlying).balanceOf(address(this)));
    }
    _updateStoredBalance();
  }

  function emergencyExit() external onlyGovernance {
    _accrueFee();
    _redeemAll();
    _setPausedInvesting(true);
    _updateStoredBalance();
  }

  function continueInvesting() public onlyGovernance {
    _setPausedInvesting(false);
  }

  function withdrawToVault(uint256 amountUnderlying) public restricted {
    _accrueFee();
    address _underlying = underlying();
    uint256 balance = IERC20(_underlying).balanceOf(address(this));
    if (amountUnderlying <= balance) {
      IERC20(_underlying).safeTransfer(vault(), amountUnderlying);
      return;
    }
    uint256 toRedeem = amountUnderlying.sub(balance);
    // get some of the underlying
    _redeem(toRedeem);
    balance = IERC20(_underlying).balanceOf(address(this));
    // transfer the amount requested (or the amount we have) back to vault()
    IERC20(_underlying).safeTransfer(vault(), Math.min(amountUnderlying, balance));
    balance = IERC20(_underlying).balanceOf(address(this));
    if (balance > 1e1) {
      _investAllUnderlying();
    }
    _updateStoredBalance();
  }

  /**
  * Withdraws all assets, liquidates XVS, and invests again in the required ratio.
  */
  function doHardWork() public restricted {
    _liquidateRewards();
    _investAllUnderlying();
    _updateStoredBalance();
  }

  /**
  * Salvages a token.
  */
  function salvage(address recipient, address token, uint256 amount) public onlyGovernance {
    // To make sure that governance cannot come in and take away the coins
    require(!unsalvagableTokens(token), "token is defined as not salvagable");
    IERC20(token).safeTransfer(recipient, amount);
  }

  function addRewardToken(address _token) public onlyGovernance {
    rewardTokens.push(_token);
  }

  function claimReward(
    uint256 _amount,
    uint8 _positoinType,
    bytes32 _positionId,
    uint256 _cycle,
    bytes32[] calldata _merkleProof,
    bytes memory _metadata
  ) external {
    IFluidMerkleDistributor(rewardPool()).claim(
      address(this),
      _amount,
      _positoinType,
      _positionId,
      _cycle,
      _merkleProof,
      _metadata
    );
  }

  function _liquidateRewards() internal {
    if (!sell()) {
      // Profits can be disabled for possible simplified and rapid exit
      emit ProfitsNotCollected(sell(), false);
      return;
    }
    _handleFee();

    address _rewardToken = rewardToken();
    address _universalLiquidator = universalLiquidator();
    for (uint256 i; i < rewardTokens.length; i++) {
      address token = rewardTokens[i];
      uint256 balance = IERC20(token).balanceOf(address(this));
      if (balance > 0 && token != _rewardToken){
        IERC20(token).safeApprove(_universalLiquidator, 0);
        IERC20(token).safeApprove(_universalLiquidator, balance);
        IUniversalLiquidator(_universalLiquidator).swap(token, _rewardToken, balance, 1, address(this));
      }
    }
    uint256 rewardBalance = IERC20(_rewardToken).balanceOf(address(this));
    _notifyProfitInRewardToken(_rewardToken, rewardBalance);
    uint256 remainingRewardBalance = IERC20(_rewardToken).balanceOf(address(this));

    if (remainingRewardBalance == 0) {
      return;
    }
  
    address _underlying = underlying();
    if (_underlying != _rewardToken) {
      IERC20(_rewardToken).safeApprove(_universalLiquidator, 0);
      IERC20(_rewardToken).safeApprove(_universalLiquidator, remainingRewardBalance);
      IUniversalLiquidator(_universalLiquidator).swap(_rewardToken, _underlying, remainingRewardBalance, 1, address(this));
    }
  }

  /**
  * Returns the current balance.
  */
  function investedUnderlyingBalance() public view returns (uint256) {
    return IERC20(underlying()).balanceOf(address(this))
    .add(storedBalance())
    .sub(pendingFee());
  }

  function _supply(uint256 amount) internal {
    address _underlying = underlying();
    address _fToken = fToken();
    IERC20(_underlying).safeApprove(_fToken, 0);
    IERC20(_underlying).safeApprove(_fToken, amount);
    IERC4626(_fToken).deposit(amount, address(this));
  }

  function _redeem(uint256 amountUnderlying) internal {
    address _fToken = fToken();
    IERC4626(_fToken).withdraw(amountUnderlying, address(this), address(this));
  }

  function _redeemAll() internal {
    address _fToken = fToken();
    if (IERC20(_fToken).balanceOf(address(this)) > 0) {
      IERC4626(_fToken).redeem(
        IERC20(_fToken).balanceOf(address(this)),
        address(this),
        address(this)
      );
    }
  }

  function _setFToken (address _target) internal {
    setAddress(_FTOKEN_SLOT, _target);
  }

  function fToken() public view returns (address) {
    return getAddress(_FTOKEN_SLOT);
  }

  function finalizeUpgrade() external onlyGovernance {
    address fluid = address(0x6f40d4A6237C257fff2dB00FA0510DeEECd303eb);
    address fluidMerkle = address(0x7060FE0Dd3E31be01EFAc6B28C8D38018fD163B0);
    rewardTokens.push(fluid);
    _setRewardToken(fluid);
    _setRewardPool(fluidMerkle);
    _finalizeUpgrade();
  }

  receive() external payable {}
}