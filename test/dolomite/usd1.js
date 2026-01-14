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
const Strategy = artifacts.require("DolomiteLendStrategyMainnet_USD1");

// Developed and tested at blockNumber 24234000

// Vanilla Mocha test. Increased compatibility with tools that integrate Mocha.
describe("Mainnet Dolomite USD1", function() {
  let accounts;

  // external contracts
  let underlying;

  // external setup
  let underlyingWhale = "0x2eC2e52d6700933FB4b6FDa6b7ca71347F94226f";
  let wfliWhale = "0xf584F8728B874a6a5c7A8d4d387C9aae9172D621";
  let wfli = "0xdA5e1988097297dCdc1f90D4dFE7909e847CBeF6";
  let wfliToken;
  let weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  let usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";


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
    underlying = await IERC20.at("0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d");
    console.log("Fetching Underlying at: ", underlying.address);
    wfliToken = await IERC20.at(wfli);
  }

  async function setupBalance(){
    let etherGiver = accounts[9];
    await web3.eth.sendTransaction({ from: etherGiver, to: underlyingWhale, value: 10e18});
    await web3.eth.sendTransaction({ from: etherGiver, to: wfliWhale, value: 10e18});

    farmerBalance = await underlying.balanceOf(underlyingWhale);
    console.log("Farmer balance: ", farmerBalance.toString());
    await underlying.transfer(farmer1, farmerBalance, { from: underlyingWhale });
  }

  before(async function() {
    governance = addresses.Governance;
    accounts = await web3.eth.getAccounts();

    farmer1 = accounts[1];

    // impersonate accounts
    await impersonates([governance, underlyingWhale, wfliWhale, addresses.ULOwner]);

    let etherGiver = accounts[9];
    await web3.eth.sendTransaction({ from: etherGiver, to: governance, value: 10e18});
    await web3.eth.sendTransaction({ from: etherGiver, to: addresses.ULOwner, value: 10e18});

    await setupExternalContracts();
    [controller, vault, strategy] = await setupCoreProtocol({
      "existingVaultAddress": null,
      "strategyArtifact": Strategy,
      "strategyArtifactIsUpgradable": true,
      "underlying": underlying,
      "governance": governance,
      "ULOwner": addresses.ULOwner,
      "liquidation": [
        {"uniV3": [wfli, weth]},
        {"uniV3": [wfli, usdc, underlying.address]}
      ],
      "uniV3Fee": [
        [wfli, weth, 3000],
        [wfli, usdc, 10000],
        [usdc, underlying.address, 100]
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
      let blocksPerHour = 240;
      let oldSharePrice;
      let newSharePrice;

      for (let i = 0; i < hours; i++) {
        console.log("loop ", i);

        if (i % 3 == 0) {
          await wfliToken.transfer(strategy.address, new BigNumber(100e18), {from: wfliWhale});
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
