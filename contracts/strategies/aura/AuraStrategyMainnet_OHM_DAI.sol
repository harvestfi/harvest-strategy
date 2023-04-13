//SPDX-License-Identifier: Unlicense
pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import "./base/AuraStrategyJoinPoolUL.sol";

contract AuraStrategyMainnet_OHM_DAI is AuraStrategyJoinPoolUL {

    constructor() public {}

    function initializeStrategy(
        address _storage, // Harvest: Storage
        address _vault // Harvest: Vault
    ) public initializer {
        address underlying = address(0x76FCf0e8C7Ff37A47a799FA2cd4c13cDe0D981C9);
        address rewardPool = address(0xB9D6ED734Ccbdd0b9CadFED712Cf8AC6D0917EcD);
        address ohm = address(0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D5);
        address dai = address(0x6B175474E89094C44Da98b954EedeAC495271d0F);
        bytes32 uniV3Dex = bytes32(0x8f78a54cb77f4634a5bf3dd452ed6a2e33432c73821be59208661199511cd94f);

        poolAssets = [ohm, dai];
        rewardTokens = [bal, aura];
        storedLiquidationPaths[bal][weth] = [bal, weth];
        storedLiquidationDexes[bal][weth] = [balancerDex];
        storedLiquidationPaths[aura][weth] = [aura, weth];
        storedLiquidationDexes[aura][weth] = [balancerDex];
        storedLiquidationPaths[weth][dai] = [weth, dai];
        storedLiquidationDexes[weth][dai] = [uniV3Dex];

        AuraStrategyJoinPoolUL.initializeBaseStrategy(
            _storage,
            underlying,
            _vault,
            rewardPool,
            56, // Aura: PoolId
            0x76fcf0e8c7ff37a47a799fa2cd4c13cde0d981c90002000000000000000003d2, // Balancer: PoolId
            dai, //Balancer: Deposit Token
            1, // Balancer: Deposit Array Position
            500
        );
    }
}
