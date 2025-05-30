// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.26;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Errors} from "./Errors.sol";
import {PlasmaVaultStorageLib} from "./PlasmaVaultStorageLib.sol";
import {FusesLib} from "./FusesLib.sol";

/// @notice Technical struct used to pass parameters in the `updateInstantWithdrawalFuses` function
struct InstantWithdrawalFusesParamsStruct {
    /// @notice The address of the fuse
    address fuse;
    /// @notice The parameters of the fuse, first element is an amount, second element is an address of the asset or a market id or other substrate specific for the fuse
    /// @dev Notice! Always first param is the asset value in underlying, next params are specific for the Fuse
    bytes32[] params;
}

/// @title Plasma Vault Library responsible for managing the Plasma Vault
library PlasmaVaultLib {
    using SafeCast for uint256;
    using SafeCast for int256;

    /// @dev Hard CAP for the performance fee in percentage - 50%
    uint256 public constant PERFORMANCE_MAX_FEE_IN_PERCENTAGE = 5000;

    /// @dev Hard CAP for the management fee in percentage - 5%
    uint256 public constant MANAGEMENT_MAX_FEE_IN_PERCENTAGE = 500;

    /// @dev The offset for the underlying asset decimals in the Plasma Vault
    uint8 public constant DECIMALS_OFFSET = 2;

    error InvalidPerformanceFee(uint256 feeInPercentage);
    error InvalidManagementFee(uint256 feeInPercentage);

    event InstantWithdrawalFusesConfigured(InstantWithdrawalFusesParamsStruct[] fuses);
    event PriceOracleMiddlewareChanged(address newPriceOracleMiddleware);
    event PerformanceFeeDataConfigured(address feeAccount, uint256 feeInPercentage);
    event ManagementFeeDataConfigured(address feeAccount, uint256 feeInPercentage);
    event RewardsClaimManagerAddressChanged(address newRewardsClaimManagerAddress);
    event DependencyBalanceGraphChanged(uint256 marketId, uint256[] newDependenceGraph);
    event WithdrawManagerChanged(address newWithdrawManager);

    /// @notice Gets the total assets in the vault for all markets
    /// @return The total assets in the vault for all markets, represented in decimals of the underlying asset
    //solhint-disable-next-line
    function getTotalAssetsInAllMarkets() internal view returns (uint256) {
        return PlasmaVaultStorageLib.getTotalAssets().value;
    }

    /// @notice Gets the total assets in the vault for a specific market
    /// @param marketId_ The market id
    /// @return The total assets in the vault for the market, represented in decimals of the underlying asset
    //solhint-disable-next-line
    function getTotalAssetsInMarket(uint256 marketId_) internal view returns (uint256) {
        return PlasmaVaultStorageLib.getMarketTotalAssets().value[marketId_];
    }

    /// @notice Gets the dependency balance graph for a specific market
    /// @param marketId_ The market id
    /// @return The dependency balance graph for the market
    /// @dev The dependency balance graph is used to update appropriate balance markets when Plasma Vault interact with a given marketId_
    function getDependencyBalanceGraph(uint256 marketId_) internal view returns (uint256[] memory) {
        return PlasmaVaultStorageLib.getDependencyBalanceGraph().dependencyGraph[marketId_];
    }

    /// @notice Updates the dependency balance graph for a specific market
    /// @param marketId_ The market id
    /// @param newDependenceGraph_ The new dependency balance graph for the market
    function updateDependencyBalanceGraph(uint256 marketId_, uint256[] memory newDependenceGraph_) internal {
        PlasmaVaultStorageLib.getDependencyBalanceGraph().dependencyGraph[marketId_] = newDependenceGraph_;
        emit DependencyBalanceGraphChanged(marketId_, newDependenceGraph_);
    }

    /// @notice Adds an amount to the total assets in the Plasma Vault for all markets
    /// @param amount_ The amount to add, represented in decimals of the underlying asset
    function addToTotalAssetsInAllMarkets(int256 amount_) internal {
        if (amount_ < 0) {
            PlasmaVaultStorageLib.getTotalAssets().value -= (-amount_).toUint256();
        } else {
            PlasmaVaultStorageLib.getTotalAssets().value += amount_.toUint256();
        }
    }

    /// @notice Updates the total assets in the Plasma Vault for a specific market
    /// @param marketId_ The market id
    /// @param newTotalAssetsInUnderlying_ The new total assets in the vault for the market, represented in decimals of the underlying asset
    /// @return deltaInUnderlying The difference between the old and the new total assets in the vault for the market
    function updateTotalAssetsInMarket(
        uint256 marketId_,
        uint256 newTotalAssetsInUnderlying_
    ) internal returns (int256 deltaInUnderlying) {
        uint256 oldTotalAssetsInUnderlying = PlasmaVaultStorageLib.getMarketTotalAssets().value[marketId_];
        PlasmaVaultStorageLib.getMarketTotalAssets().value[marketId_] = newTotalAssetsInUnderlying_;
        deltaInUnderlying = newTotalAssetsInUnderlying_.toInt256() - oldTotalAssetsInUnderlying.toInt256();
    }

    /// @notice Gets the management fee data
    /// @return managementFeeData The management fee data, like the fee manager and the fee in percentage
    //solhint-disable-next-line
    function getManagementFeeData()
        internal
        pure
        returns (PlasmaVaultStorageLib.ManagementFeeData memory managementFeeData)
    {
        return PlasmaVaultStorageLib.getManagementFeeData();
    }

    /// @notice Configures the management fee data like the fee manager and the fee in percentage
    /// @param feeAccount_ The address of the fee manager responsible for managing the management fee
    /// @param feeInPercentage_ The fee in percentage, represented in 2 decimals, example: 100% = 10000, 1% = 100, 0.01% = 1
    function configureManagementFee(address feeAccount_, uint256 feeInPercentage_) internal {
        if (feeAccount_ == address(0)) {
            revert Errors.WrongAddress();
        }
        if (feeInPercentage_ > MANAGEMENT_MAX_FEE_IN_PERCENTAGE) {
            revert InvalidManagementFee(feeInPercentage_);
        }

        PlasmaVaultStorageLib.ManagementFeeData storage managementFeeData = PlasmaVaultStorageLib
            .getManagementFeeData();

        managementFeeData.feeAccount = feeAccount_;
        managementFeeData.feeInPercentage = feeInPercentage_.toUint16();

        emit ManagementFeeDataConfigured(feeAccount_, feeInPercentage_);
    }

    /// @notice Gets the performance fee data
    /// @return performanceFeeData The performance fee data, like the fee manager and the fee in percentage
    //solhint-disable-next-line
    function getPerformanceFeeData()
        internal
        pure
        returns (PlasmaVaultStorageLib.PerformanceFeeData memory performanceFeeData)
    {
        return PlasmaVaultStorageLib.getPerformanceFeeData();
    }

    /// @notice Configures the performance fee data like the fee manager and the fee in percentage
    /// @param feeAccount_ The address of the fee manager responsible for managing the performance fee
    /// @param feeInPercentage_ The fee in percentage, represented in 2 decimals, example: 100% = 10000, 1% = 100, 0.01% = 1
    function configurePerformanceFee(address feeAccount_, uint256 feeInPercentage_) internal {
        if (feeAccount_ == address(0)) {
            revert Errors.WrongAddress();
        }
        if (feeInPercentage_ > PERFORMANCE_MAX_FEE_IN_PERCENTAGE) {
            revert InvalidPerformanceFee(feeInPercentage_);
        }

        PlasmaVaultStorageLib.PerformanceFeeData storage performanceFeeData = PlasmaVaultStorageLib
            .getPerformanceFeeData();

        performanceFeeData.feeAccount = feeAccount_;
        performanceFeeData.feeInPercentage = feeInPercentage_.toUint16();

        emit PerformanceFeeDataConfigured(feeAccount_, feeInPercentage_);
    }

    /// @notice Updates the management fee data with the current timestamp
    /// @dev lastUpdateTimestamp is used to calculate unrealized management fees
    function updateManagementFeeData() internal {
        PlasmaVaultStorageLib.ManagementFeeData storage feeData = PlasmaVaultStorageLib.getManagementFeeData();
        feeData.lastUpdateTimestamp = block.timestamp.toUint32();
    }

    /// @notice Gets instant withdrawal fuses
    /// @return The instant withdrawal fuses, the order of the fuses is important
    function getInstantWithdrawalFuses() internal view returns (address[] memory) {
        return PlasmaVaultStorageLib.getInstantWithdrawalFusesArray().value;
    }

    /// @notice Gets the instant withdrawal fuses parameters for a specific fuse
    /// @param fuse_ The fuse address
    /// @param index_ The index of the Fuse in the fuses array
    /// @return The instant withdrawal fuses parameters
    function getInstantWithdrawalFusesParams(address fuse_, uint256 index_) internal view returns (bytes32[] memory) {
        return
            PlasmaVaultStorageLib.getInstantWithdrawalFusesParams().value[keccak256(abi.encodePacked(fuse_, index_))];
    }

    /// @notice Configures order of the instant withdrawal fuses. Order of the fuse is important, as it will be used in the same order during the instant withdrawal process
    /// @param fuses_ The fuses to configure
    /// @dev Order of the fuses is important, the same fuse can be used multiple times with different parameters (for example different assets, markets or any other substrate specific for the fuse)
    function configureInstantWithdrawalFuses(InstantWithdrawalFusesParamsStruct[] calldata fuses_) internal {
        address[] memory fusesList = new address[](fuses_.length);

        PlasmaVaultStorageLib.InstantWithdrawalFusesParams storage instantWithdrawalFusesParams = PlasmaVaultStorageLib
            .getInstantWithdrawalFusesParams();

        bytes32 key;

        for (uint256 i; i < fuses_.length; ++i) {
            if (!FusesLib.isFuseSupported(fuses_[i].fuse)) {
                revert FusesLib.FuseUnsupported(fuses_[i].fuse);
            }

            fusesList[i] = fuses_[i].fuse;
            key = keccak256(abi.encodePacked(fuses_[i].fuse, i));

            delete instantWithdrawalFusesParams.value[key];

            for (uint256 j; j < fuses_[i].params.length; ++j) {
                instantWithdrawalFusesParams.value[key].push(fuses_[i].params[j]);
            }
        }

        delete PlasmaVaultStorageLib.getInstantWithdrawalFusesArray().value;

        PlasmaVaultStorageLib.getInstantWithdrawalFusesArray().value = fusesList;

        emit InstantWithdrawalFusesConfigured(fuses_);
    }

    /// @notice Gets the Price Oracle Middleware address
    /// @return The Price Oracle Middleware address
    function getPriceOracleMiddleware() internal view returns (address) {
        return PlasmaVaultStorageLib.getPriceOracleMiddleware().value;
    }

    /// @notice Sets the Price Oracle Middleware address
    /// @param priceOracleMiddleware_ The Price Oracle Middleware address
    function setPriceOracleMiddleware(address priceOracleMiddleware_) internal {
        PlasmaVaultStorageLib.getPriceOracleMiddleware().value = priceOracleMiddleware_;
        emit PriceOracleMiddlewareChanged(priceOracleMiddleware_);
    }

    /// @notice Gets the Rewards Claim Manager address
    /// @return The Rewards Claim Manager address
    function getRewardsClaimManagerAddress() internal view returns (address) {
        return PlasmaVaultStorageLib.getRewardsClaimManagerAddress().value;
    }

    /// @notice Sets the Rewards Claim Manager address
    /// @param rewardsClaimManagerAddress_ The rewards claim manager address
    function setRewardsClaimManagerAddress(address rewardsClaimManagerAddress_) internal {
        PlasmaVaultStorageLib.getRewardsClaimManagerAddress().value = rewardsClaimManagerAddress_;
        emit RewardsClaimManagerAddressChanged(rewardsClaimManagerAddress_);
    }

    /// @notice Gets the total supply cap
    /// @return The total supply cap, represented in decimals of the underlying asset
    function getTotalSupplyCap() internal view returns (uint256) {
        return PlasmaVaultStorageLib.getERC20CappedStorage().cap;
    }

    /// @notice Sets the total supply cap
    /// @param cap_ The total supply cap, represented in decimals of the underlying asset
    function setTotalSupplyCap(uint256 cap_) internal {
        if (cap_ == 0) {
            revert Errors.WrongValue();
        }
        PlasmaVaultStorageLib.getERC20CappedStorage().cap = cap_;
    }

    /// @notice Sets the total supply cap validation
    /// @param flag_ The total supply cap validation flag
    /// @dev 1 - no validation, 0 - validation, total supply validation cap is disabled when performance fee or management fee is minted.
    /// By default, the total supply cap validation is enabled (flag_ = 0)
    function setTotalSupplyCapValidation(uint256 flag_) internal {
        PlasmaVaultStorageLib.getERC20CappedValidationFlag().value = flag_;
    }

    /// @notice Checks if the total supply cap validation is enabled
    /// @return true if the total supply cap validation is enabled, false otherwise
    function isTotalSupplyCapValidationEnabled() internal view returns (bool) {
        return PlasmaVaultStorageLib.getERC20CappedValidationFlag().value == 0;
    }

    /// @notice Sets the execution state to started, used in the execute function called by Alpha
    /// @dev Alpha can do interaction with the Plasma Vault using more than one FuseAction
    function executeStarted() internal {
        PlasmaVaultStorageLib.getExecutionState().value = 1;
    }

    /// @notice Sets the execution state to finished, used in the execute function called by Alpha
    /// @dev Alpha can do interaction with the Plasma Vault using more than one FuseAction
    function executeFinished() internal {
        PlasmaVaultStorageLib.getExecutionState().value = 0;
    }

    /// @notice Checks if the execution is started
    /// @return true if the execution is started
    function isExecutionStarted() internal view returns (bool) {
        return PlasmaVaultStorageLib.getExecutionState().value == 1;
    }

    /// @notice Updates the Withdraw Manager address. If the address is zero, it means that scheduled withdrawals are turned off.
    function updateWithdrawManager(address newWithdrawManager_) internal {
        PlasmaVaultStorageLib.getWithdrawManager().manager = newWithdrawManager_;

        emit WithdrawManagerChanged(newWithdrawManager_);
    }
}