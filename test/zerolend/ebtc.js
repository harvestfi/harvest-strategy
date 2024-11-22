// Utilities
const Utils = require("../utilities/Utils.js");
const { impersonates, setupCoreProtocol, depositVault } = require("../utilities/hh-utils.js");
const addresses = require("../test-config.js");

const BigNumber = require("bignumber.js");
const IERC20 = artifacts.require("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20");

const Strategy = artifacts.require("ZerolendFoldStrategyMainnet_eBTC");

//This test was developed at blockNumber 21221280

// Vanilla Mocha test. Increased compatibility with tools that integrate Mocha.
describe("Mainnet ZeroLend eBTC", function() {
  let accounts;

  // external contracts
  let underlying;

  // external setup
  let underlyingWhale = "0xC2E5c06c1cb04E5cb9314Ac8131cf047e32f453c";
  let zero = "0x2Da17fAf782ae884faf7dB2208BBC66b6E085C22";
  let weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  let wbtc = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";

  // parties in the protocol
  let governance;
  let farmer1;

  // numbers used in tests
  let farmerBalance;

  // Core protocol contracts
  let controller;
  let vault;
  let strategy;

  async function setupExternalContracts() {
    underlying = await IERC20.at("0x657e8C867D8B37dCC18fA4Caead9C45EB088C642");
    console.log("Fetching Underlying at: ", underlying.address);
  }

  async function setupBalance(){
    let etherGiver = accounts[9];
    // Give whale some ether to make sure the following actions are good
    await web3.eth.sendTransaction({ from: etherGiver, to: underlyingWhale, value: 10e18});

    farmerBalance = await underlying.balanceOf(underlyingWhale);
    await underlying.transfer(farmer1, farmerBalance, { from: underlyingWhale });
  }

  before(async function() {
    governance = addresses.Governance;
    accounts = await web3.eth.getAccounts();

    await web3.eth.sendTransaction({ from: accounts[8], to: governance, value: 10e18});

    farmer1 = accounts[1];

    // impersonate accounts
    await impersonates([governance, underlyingWhale]);

    await setupExternalContracts();
    [controller, vault, strategy] = await setupCoreProtocol({
      "existingVaultAddress": null,
      "strategyArtifact": Strategy,
      "strategyArtifactIsUpgradable": true,
      "underlying": underlying,
      "governance": governance,
      "liquidation": [
        {"curve": [weth, wbtc, underlying.address]},
        {"uniV3": [zero, weth]},
        {"curve": [underlying.address, wbtc, weth]},
      ],
      "uniV3Fee": [
        [zero, weth, '10000'],
      ],
      // @param _swap_params Multidimensional array of [i, j, swap_type, pool_type, n_coins] where
      //                   i is the index of input token
      //                   j is the index of output token

      //                   The swap_type should be:
      //                   1. for `exchange`,
      //                   2. for `exchange_underlying`,
      //                   3. for underlying exchange via zap: factory stable metapools with lending base pool `exchange_underlying`
      //                      and factory crypto-meta pools underlying exchange (`exchange` method in zap)
      //                   4. for coin -> LP token "exchange" (actually `add_liquidity`),
      //                   5. for lending pool underlying coin -> LP token "exchange" (actually `add_liquidity`),
      //                   6. for LP token -> coin "exchange" (actually `remove_liquidity_one_coin`)
      //                   7. for LP token -> lending or fake pool underlying coin "exchange" (actually `remove_liquidity_one_coin`)
      //                   8. for ETH <-> WETH, ETH -> stETH or ETH -> frxETH, stETH <-> wstETH, frxETH <-> sfrxETH, ETH -> wBETH, USDe -> sUSDe

      //                   pool_type: 1 - stable, 2 - twocrypto, 3 - tricrypto, 4 - llamma
      //                              10 - stable-ng, 20 - twocrypto-ng, 30 - tricrypto-ng

      //                   n_coins is the number of coins in pool
      "curveSetup": [
        [underlying.address, wbtc, "0x7704D01908afD31bf647d969c295BB45230cD2d6", [0, 1, 1, 10, 2]],
        [wbtc, underlying.address, "0x7704D01908afD31bf647d969c295BB45230cD2d6", [1, 0, 1, 10, 2]],
        [wbtc, weth, "0xD51a44d3FaE010294C616388b506AcdA1bfAAE46", [1, 2, 1, 3, 3]],
        [weth, wbtc, "0xD51a44d3FaE010294C616388b506AcdA1bfAAE46", [2, 1, 1, 3, 3]],
      ]
    });

    // whale send underlying to farmers
    await setupBalance();
  });

  describe("Happy path", function() {
    it("Farmer should earn money", async function() {
      let farmerOldBalance = new BigNumber(await underlying.balanceOf(farmer1));
      await depositVault(farmer1, underlying, vault, farmerBalance);
      let fTokenBalance = new BigNumber(await vault.balanceOf(farmer1));

      // Using half days is to simulate how we doHardwork in the real world
      let hours = 10;
      let blocksPerHour = 2400;
      let oldSharePrice;
      let newSharePrice;
      for (let i = 0; i < hours; i++) {
        console.log("loop ", i);

        oldSharePrice = new BigNumber(await vault.getPricePerFullShare());
        await controller.doHardWork(vault.address, { from: governance });
        newSharePrice = new BigNumber(await vault.getPricePerFullShare());

        console.log("old shareprice: ", oldSharePrice.toFixed());
        console.log("new shareprice: ", newSharePrice.toFixed());
        console.log("growth: ", newSharePrice.toFixed() / oldSharePrice.toFixed());

        apr = (newSharePrice.toFixed()/oldSharePrice.toFixed()-1)*(24/(blocksPerHour/300))*365;
        apy = ((newSharePrice.toFixed()/oldSharePrice.toFixed()-1)*(24/(blocksPerHour/300))+1)**365;

        console.log("instant APR:", apr*100, "%");
        console.log("instant APY:", (apy-1)*100, "%");
        await vault.withdraw(fTokenBalance.div(10), { from: farmer1 });
        await depositVault(farmer1, underlying, vault, new BigNumber(await underlying.balanceOf(farmer1)))
        await Utils.advanceNBlock(blocksPerHour);
      }
      fTokenBalance = new BigNumber(await vault.balanceOf(farmer1));
      await vault.withdraw(fTokenBalance, { from: farmer1 });
      let farmerNewBalance = new BigNumber(await underlying.balanceOf(farmer1));
      Utils.assertBNGt(farmerNewBalance, farmerOldBalance);

      apr = (farmerNewBalance.toFixed()/farmerOldBalance.toFixed()-1)*(24/(blocksPerHour*hours/300))*365;
      apy = ((farmerNewBalance.toFixed()/farmerOldBalance.toFixed()-1)*(24/(blocksPerHour*hours/300))+1)**365;

      console.log("earned!");
      console.log("Overall APR:", apr*100, "%");
      console.log("Overall APY:", (apy-1)*100, "%");

      await strategy.withdrawAllToVault({ from: governance }); // making sure can withdraw all for a next switch
    });
  });
});