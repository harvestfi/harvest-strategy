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
const Strategy = artifacts.require("FluidLendStrategyMainnet_USDC");

// Developed and tested at blockNumber 22488430

// Vanilla Mocha test. Increased compatibility with tools that integrate Mocha.
describe("Mainnet Fluid Lend USDC", function() {
  let accounts;

  // external contracts
  let underlying;

  // external setup
  let underlyingWhale = "0xC67A7BcA42de8bD5d0F855ED69A8F4d0b08326fC";
  let fluidWhale = "0x66085204c9ccCe6C8D75Aa595c65373d570e031c";
  let usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
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
    underlying = await IERC20.at("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
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
      "existingVaultAddress": "0xfc1c3E7b62181f9A66AEc94C9bE54dc525e2838F",
      "upgradeStrategy": true,
      "strategyArtifact": Strategy,
      "strategyArtifactIsUpgradable": true,
      "underlying": underlying,
      "governance": governance,
      "ULOwner": addresses.ULOwner,
      "liquidation": [
        {"uniV3": [fluid, weth]},
        {"uniV3": [fluid, weth, usdc]},
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

      console.log(strategy.address);

      await strategy.claimReward(
        "188123233151504035",
        1,
        "0x9fb7b4477576fe5b32be4c1843afb1e55f251b33",
        450,
        ["0x0f40bb158d912150b7eac0f0db247fb6cc3c13612e92bba187b77f76e986b3f4","0x5459c6a5b6fbd0f442a65049f20400e79d5ff8f628d877ff3e2578a968c28e00","0x2f866c4fd31d7e78bc54158d7b06dd25c7b0862e609505ae56fabd6bc6a9adf4","0xbfa1fb36adb94f8c1369c6b1f58c76c9c2f63be4643cf1ba8acb80bdd42a32f9","0x53e3c941b1864ae8812a6aa2f848757ec01922a18de151637e525f2050bf765d","0x0326d5a0756b87af0e6e042035c0896a9f3eb11c5c82cdbea04e6717e65eec19","0x6cd74e5e64c83f0e39c246d2ed58e9ceebe712d0623a1c0155bab52161531795","0x7666bbc786a16ef567d99d3f3cc64c95b24a8bc0c368f72d506b317ab2cce025","0xa1ee2652a2cee9aa15c2198dfd84cece66ebdb5aadf91d03ab74491aa6805272","0xb12b51d09f7cbb3d25dbac5b5cdd7b6ac3904ee515114d9bb910cdda17cde82d","0x65758515cd2afc0d100c44c84e10186cb25dc299c835a20f6347c5da1a37d9f5","0xd3732f98cfedde44ba991f9b2744bc1c73f00fe46297197f325eef4fc446c157","0xab60e5cd9dd5603d61b937ce5e3ac20f016b0ee523c64ad93dc9fee0c184fd1c","0x33cc32247f9132c5b3bd7255bac4c8d9ba50deb041901ca80138433c21b0152c"],
        "0x"  
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
