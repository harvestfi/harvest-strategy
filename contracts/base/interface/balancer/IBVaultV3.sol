//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.26;

interface IBVaultV3 {
    enum AddLiquidityKind {
        PROPORTIONAL,
        UNBALANCED,
        SINGLE_TOKEN_EXACT_OUT,
        DONATION,
        CUSTOM
    }

    struct AddLiquidityParams {
        address pool;
        address to;
        uint256[] maxAmountsIn;
        uint256 minBptAmountOut;
        AddLiquidityKind kind;
        bytes userData;
    }
    
    function getPoolTokenCountAndIndexOfToken(address pool, address token) external view returns (uint256 count, uint256 index);
    function addLiquidity(AddLiquidityParams memory params) external returns (uint256[] memory amountsIn, uint256 bptAmountOut, bytes memory returnData);

}