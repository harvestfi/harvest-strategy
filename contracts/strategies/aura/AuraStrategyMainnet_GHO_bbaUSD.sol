//SPDX-License-Identifier: Unlicense
pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import "./base/AuraStrategyBatchSwapUL.sol";

contract AuraStrategyMainnet_GHO_bbaUSD is AuraStrategyBatchSwapUL {

    //Differentiator for the bytecode
    address public bbaUSD_unused;

    constructor() public {}

    function initializeStrategy(
        address _storage, // Harvest: Storage
        address _vault // Harvest: Vault
    ) public initializer {
        address underlying = address(0xc2B021133D1b0cF07dba696fd5DD89338428225B); // Balancer: Balancer Aave Boosted StablePool
        address rewardPool = address(0xF937b186687C0B11Dc0F7AFBA3B4458c30d9CF89); // Aura: Balancer Aave Boosted StablePool Aura Deposit Vault
        bytes32 wETH_USDC = bytes32(0x96646936b91d6b9d7d0c47c496afbf3d6ec7b6f8000200000000000000000019);
        bytes32 USDC_bbaUSDC = bytes32(0xc50d4347209f285247bda8a09fc1c12ce42031c3000000000000000000000590);
        bytes32 bbaUSDC_bbaUSD = bytes32(0xc443c15033fcb6cf72cc24f1bda0db070ddd9786000000000000000000000593);
        bytes32 gho_bbaUSD = bytes32(0xc2b021133d1b0cf07dba696fd5dd89338428225b000000000000000000000598);
        address usdc = address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
        address bbaUSDC = address(0xc50d4347209F285247BDa8A09Fc1C12CE42031c3);
        address bbaUSD = address(0xc443C15033FCB6Cf72cC24f1BDA0Db070DdD9786);

        // WETH -> USDC -> bb-a-USDC -> bb-a-USD
        swapAssets = [weth, usdc, bbaUSDC, bbaUSD, underlying];
        swapPoolIds = [wETH_USDC, USDC_bbaUSDC, bbaUSDC_bbaUSD, gho_bbaUSD];

        rewardTokens = [bal, aura];
        storedLiquidationPaths[bal][weth] = [bal, weth];
        storedLiquidationDexes[bal][weth] = [balancerDex];
        storedLiquidationPaths[aura][weth] = [aura, weth];
        storedLiquidationDexes[aura][weth] = [balancerDex];
        AuraStrategyBatchSwapUL.initializeBaseStrategy(
            _storage,
            underlying,
            _vault,
            rewardPool,
            135, // Aura: PoolId
            weth, //Balancer: Deposit Token
            500
        );
    }
}
