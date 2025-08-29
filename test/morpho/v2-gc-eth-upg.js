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
const IRewardPrePay = artifacts.require("IRewardPrePay");

//const Strategy = artifacts.require("");
const Strategy = artifacts.require("MorphoVaultStrategyV2Mainnet_GC_ETH");

// Developed and tested at blockNumber 23246180

// Vanilla Mocha test. Increased compatibility with tools that integrate Mocha.
describe("Mainnet Morpho Gauntlet Core ETH - upgrade", function() {
  let accounts;

  // external contracts
  let underlying;

  // external setup
  let underlyingWhale = "0x9f9401c76e054D1c9fE3b94a7356361Ff32b1Ea1";
  let morphoWhale = "0x72b23AeBbD4aBfc1cEA755686710E74c93696Fae";
  let morpho = "0x58D97B57BB95320F9a05dC918Aef65434969c2B2";
  let morphoToken;
  let fxnWhale = "0xFb305A40Dac406BdCF3b85F6311e5430770f44bA";
  let fxn = "0x365AccFCa291e7D3914637ABf1F7635dB165Bb09";
  let fxnToken;
  let weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";


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
    underlying = await IERC20.at("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
    console.log("Fetching Underlying at: ", underlying.address);
    morphoToken = await IERC20.at(morpho);
    fxnToken = await IERC20.at(fxn);
  }

  async function setupBalance(){
    let etherGiver = accounts[9];
    await web3.eth.sendTransaction({ from: etherGiver, to: underlyingWhale, value: 10e18});
    await web3.eth.sendTransaction({ from: etherGiver, to: morphoWhale, value: 10e18});
    await web3.eth.sendTransaction({ from: etherGiver, to: fxnWhale, value: 10e18});

    farmerBalance = await underlying.balanceOf(underlyingWhale);
    console.log("Farmer balance: ", farmerBalance.toString());
    await underlying.transfer(farmer1, farmerBalance, { from: underlyingWhale });
  }

  before(async function() {
    governance = addresses.Governance;
    accounts = await web3.eth.getAccounts();

    farmer1 = accounts[1];

    // impersonate accounts
    await impersonates([governance, underlyingWhale, morphoWhale, fxnWhale, addresses.ULOwner]);

    let etherGiver = accounts[9];
    await web3.eth.sendTransaction({ from: etherGiver, to: governance, value: 10e18});
    await web3.eth.sendTransaction({ from: etherGiver, to: addresses.ULOwner, value: 10e18});

    await setupExternalContracts();
    [controller, vault, strategy] = await setupCoreProtocol({
      "existingVaultAddress": "0x73515227DB81b4F506cb24f077d391886DA789c9",
      "upgradeStrategy": true,
      "strategyArtifact": Strategy,
      "strategyArtifactIsUpgradable": true,
      "underlying": underlying,
      "governance": governance,
      "ULOwner": addresses.ULOwner,
      "liquidation": [
        {"curve": [fxn, weth]},
      ],
      "curveSetup": [
        [fxn, weth, "0xC15F285679a1Ef2d25F53D4CbD0265E1D02F2A92", [1, 0, 1, 2, 2]],
      ]
    });

    // whale send underlying to farmers
    await setupBalance();

    await strategy.toggleMerklOperator("0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae", "0x6a74649aCFD7822ae8Fb78463a9f2192752E5Aa2", {from: governance});
    await strategy.toggleMerklOperator("0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae", "0xFeed4C53d827AEBEBED6066788065eA1027C7e70", {from: governance});
  });

  describe("Happy path", function() {
    it("Farmer should earn money", async function() {
      let farmerOldBalance = new BigNumber(await underlying.balanceOf(farmer1));
      await depositVault(farmer1, underlying, vault, farmerBalance);

      let hours = 10;
      let blocksPerHour = 2400;
      let oldSharePrice;
      let newSharePrice;

      for (let i = 0; i < hours; i++) {
        console.log("loop ", i);

        if (i % 3 == 0) {
          await morphoToken.transfer(strategy.address, new BigNumber(10e18), {from: morphoWhale});
          await fxnToken.transfer(strategy.address, new BigNumber(1e18), {from: fxnWhale});
        }

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
