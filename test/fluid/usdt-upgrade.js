// Utilities
const Utils = require("../utilities/Utils.js");
const {
  impersonates,
  setupCoreProtocol,
  depositVault,
} = require("../utilities/hh-utils.js");

const addresses = require("../test-config.js");
const BigNumber = require("bignumber.js");
const IERC20 = artifacts.require("IERC20");

//const Strategy = artifacts.require("");
const Strategy = artifacts.require("FluidLendStrategyMainnet_USDT");

// Developed and tested at blockNumber 22488430

// Vanilla Mocha test. Increased compatibility with tools that integrate Mocha.
describe("Mainnet Fluid Lend USDT", function() {
  let accounts;

  // external contracts
  let underlying;

  // external setup
  let underlyingWhale = "0x66bFA8e467CE873041a52F1b70260dEaf6355237";
  let fluidWhale = "0x66085204c9ccCe6C8D75Aa595c65373d570e031c";
  let usdt = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  let weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  let fluid = "0x6f40d4A6237C257fff2dB00FA0510DeEECd303eb";
  let fluidToken;

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
    underlying = await IERC20.at("0xdAC17F958D2ee523a2206206994597C13D831ec7");
    console.log("Fetching Underlying at: ", underlying.address);
    fluidToken = await IERC20.at(fluid);
  }

  async function setupBalance(){
    let etherGiver = accounts[9];
    await web3.eth.sendTransaction({ from: etherGiver, to: underlyingWhale, value: 10e18});
    await web3.eth.sendTransaction({ from: etherGiver, to: fluidWhale, value: 10e18});

    farmerBalance = await underlying.balanceOf(underlyingWhale);
    await underlying.transfer(farmer1, farmerBalance, { from: underlyingWhale });
  }

  before(async function() {
    governance = addresses.Governance;
    accounts = await web3.eth.getAccounts();

    farmer1 = accounts[1];

    // impersonate accounts
    await impersonates([governance, underlyingWhale, addresses.ULOwner, fluidWhale]);

    let etherGiver = accounts[9];
    await web3.eth.sendTransaction({ from: etherGiver, to: governance, value: 10e18});
    await web3.eth.sendTransaction({ from: etherGiver, to: addresses.ULOwner, value: 10e18});

    await setupExternalContracts();
    [controller, vault, strategy] = await setupCoreProtocol({
      "existingVaultAddress": "0x555495529852821368d3D4ee677914B3Dbc3ed63",
      "upgradeStrategy": true,
      "strategyArtifact": Strategy,
      "strategyArtifactIsUpgradable": true,
      "underlying": underlying,
      "governance": governance,
      "ULOwner": addresses.ULOwner,
      "liquidation": [
        {"uniV3": [fluid, weth]},
        {"uniV3": [fluid, weth, usdt]},
      ],
      "uniV3Fee": [
        [fluid, weth, 3000],
      ],
    });

    // whale send underlying to farmers
    await setupBalance();
  });

  describe("Happy path", function() {
    it("Farmer should earn money", async function() {
      let farmerOldBalance = new BigNumber(await underlying.balanceOf(farmer1));
      await depositVault(farmer1, underlying, vault, farmerBalance);

      let hours = 10;
      let blocksPerHour = 2400;
      let oldSharePrice;
      let newSharePrice;

      await strategy.claimReward(
        "212541928355135260",
        1,
        "0x5c20b550819128074fd538edf79791733ccedd18",
        450,
        [
          "0x945988d89f79fa310ef86dac044dc8894f46f31fcbf9d324b1d28d70d066c515",
          "0xa2336b94e5c77b7561e627579bead79dd186b28a82a1d692a54370bde9a7bfec",
          "0x7e017b631caa74aad6a7d8d1fdf665224ba4307c0f0d1d02103aceaf8c0e310c",
          "0x8d6b4571765cade635919ccd1e3c1e285fc330085bde733cac3d0682d66c4d95",
          "0xd863acd5110bfbbc449c4506f07c51fb101bf9a22d12f5fa159623059ce600f6",
          "0x0d401d2e220a888bc11796a7ce8ed3997c72defdf0ef2984d014c0e7718c7083",
          "0xa888eb1b153ed77a49aeed8705200a526ca25659a5e52a72a22f8a4cc45daf26",
          "0x3029b11e8f52e399745e3c0715c5959e9ff6da45b0a80d1e4c11ad61a61c48fd",
          "0x1a0cad0cd21a921eb31e344b7d270a06ba824cfff9172c62474757d9bd23856c",
          "0x2f7fecb32965840b25484344eb1a565142020d071c275f7ec3d363e42197d91d",
          "0x9f8cb2d706767055d9aa17de1a86ef4cfd27b13198dfb1cc1bd934b89ef745bf",
          "0x6e1bc8e4d74db1171600bb7ec61a8f39968193581b3e88e33ce950dfadb4492d",
          "0xa2af4ea6eed3c5c519ee51950d7262a73e39b344c191599da6c19823561756cd"
        ],
      )

      for (let i = 0; i < hours; i++) {
        console.log("loop ", i);

        await fluidToken.transfer(strategy.address, new BigNumber(10e18).toFixed(), {from: fluidWhale});

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

        await Utils.advanceNBlock(blocksPerHour);
      }
      await vault.withdraw(new BigNumber(await vault.balanceOf(farmer1)).toFixed(), { from: farmer1 });
      let farmerNewBalance = new BigNumber(await underlying.balanceOf(farmer1));
      Utils.assertBNGt(farmerNewBalance, farmerOldBalance);

      apr = (farmerNewBalance.toFixed()/farmerOldBalance.toFixed()-1)*(24/(blocksPerHour*hours/300))*365;
      apy = ((farmerNewBalance.toFixed()/farmerOldBalance.toFixed()-1)*(24/(blocksPerHour*hours/300))+1)**365;

      console.log("earned!");
      console.log("APR:", apr*100, "%");
      console.log("APY:", (apy-1)*100, "%");

      await strategy.withdrawAllToVault({from:governance}); // making sure can withdraw all for a next switch

    });
  });
});
