//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.26;

interface INProxy {
    /// @notice Specifies different deposit actions that can occur during BalanceAction or BalanceActionWithTrades
    enum DepositActionType {
        // No deposit action
        None,
        // Deposit asset cash, depositActionAmount is specified in asset cash external precision
        DepositAsset,
        // Deposit underlying tokens that are mintable to asset cash, depositActionAmount is specified in underlying token
        // external precision
        DepositUnderlying,
        // Deposits specified asset cash external precision amount into an nToken and mints the corresponding amount of
        // nTokens into the account
        DepositAssetAndMintNToken,
        // Deposits specified underlying in external precision, mints asset cash, and uses that asset cash to mint nTokens
        DepositUnderlyingAndMintNToken,
        // Redeems an nToken balance to asset cash. depositActionAmount is specified in nToken precision. Considered a deposit action
        // because it deposits asset cash into an account. If there are fCash residuals that cannot be sold off, will revert.
        RedeemNToken,
        // Converts specified amount of asset cash balance already in Notional to nTokens. depositActionAmount is specified in
        // Notional internal 8 decimal precision.
        ConvertCashToNToken
    }
    /// @notice Defines a balance action for batchAction
    struct BalanceAction {
        // Deposit action to take (if any)
        DepositActionType actionType;
        uint16 currencyId;
        // Deposit action amount must correspond to the depositActionType, see documentation above.
        uint256 depositActionAmount;
        // Withdraw an amount of asset cash specified in Notional internal 8 decimal precision
        uint256 withdrawAmountInternalPrecision;
        // If set to true, will withdraw entire cash balance. Useful if there may be an unknown amount of asset cash
        // residual left from trading.
        bool withdrawEntireCashBalance;
        // If set to true, will redeem asset cash to the underlying token on withdraw.
        bool redeemToUnderlying;
    }
    function getCurrencyId(address token) external view returns(uint16 currencyId);
    function batchBalanceAction(address account, BalanceAction[] calldata actions) external payable;
    function nTokenClaimIncentives() external;
}