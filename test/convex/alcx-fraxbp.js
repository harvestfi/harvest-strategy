// Utilities
const Utils = require("../utilities/Utils.js");
const {
  impersonates,
  setupCoreProtocol,
  depositVault,
} = require("../utilities/hh-utils.js");
const addresses = require("../test-config.js");

const BigNumber = require("bignumber.js");
const IERC20 = artifacts.require(
  "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20"
);

const Strategy = artifacts.require("ConvexStrategyMainnet_ALCX_FRAXBP");

//This test was developed at blockNumber 	22229020

// Vanilla Mocha test. Increased compatibility with tools that integrate Mocha.
describe("Mainnet Convex ALCX-FRAXBP", function () {
  let accounts;

  // external contracts
  let underlying;

  // external setup
  let underlyingWhale = "0x44299097358A1aBD676f06015c6243f6D73fafC5";
  let crv = "0xD533a949740bb3306d119CC777fa900bA034cd52";
  let cvx = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
  let weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  let alcx = "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF";

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
    underlying = await IERC20.at("0xf985005a3793DbA4cCe241B3C19ddcd3Fe069ff4");
    console.log("Fetching Underlying at: ", underlying.address);
  }

  async function setupBalance() {
    let etherGiver = accounts[9];
    // Give whale some ether to make sure the following actions are good
    await web3.eth.sendTransaction({
      from: etherGiver,
      to: underlyingWhale,
      value: 10e18,
    });

    farmerBalance = await underlying.balanceOf(underlyingWhale);
    await underlying.transfer(farmer1, farmerBalance, {
      from: underlyingWhale,
    });
  }

  before(async function () {
    governance = addresses.Governance;
    accounts = await web3.eth.getAccounts();

    await web3.eth.sendTransaction({
      from: accounts[8],
      to: governance,
      value: 10e18,
    });

    await web3.eth.sendTransaction({
      from: accounts[8],
      to: addresses.ULOwner,
      value: 10e18,
    });

    farmer1 = accounts[1];

    // impersonate accounts
    await impersonates([governance, underlyingWhale, addresses.ULOwner]);

    await setupExternalContracts();
    [controller, vault, strategy] = await setupCoreProtocol({
      existingVaultAddress: null,
      strategyArtifact: Strategy,
      strategyArtifactIsUpgradable: true,
      underlying: underlying,
      governance: governance,
      liquidation: [
        { uniV3: [cvx, weth] },
        { uniV3: [crv, weth] },
        { balancer: [weth, alcx] },
      ],
      uniV3Fee: [
        [weth, crv, "3000"],
        [weth, cvx, "10000"],
      ],
      balPool: [
        [
          weth,
          alcx,
          "0xf16aee6a71af1a9bc8f56975a4c2705ca7a782bc0002000000000000000004bb",
        ],
      ],
      ULOwner: addresses.ULOwner,
    });

    // whale send underlying to farmers
    await setupBalance();
  });

  describe("Happy path", function () {
    it("Farmer should earn money", async function () {
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
        console.log(
          "growth: ",
          newSharePrice.toFixed() / oldSharePrice.toFixed()
        );

        apr =
          (newSharePrice.toFixed() / oldSharePrice.toFixed() - 1) *
          (24 / (blocksPerHour / 300)) *
          365;
        apy =
          ((newSharePrice.toFixed() / oldSharePrice.toFixed() - 1) *
            (24 / (blocksPerHour / 300)) +
            1) **
          365;

        console.log("instant APR:", apr * 100, "%");
        console.log("instant APY:", (apy - 1) * 100, "%");
        await vault.withdraw(fTokenBalance.div(10), { from: farmer1 });
        await depositVault(
          farmer1,
          underlying,
          vault,
          new BigNumber(await underlying.balanceOf(farmer1))
        );
        await Utils.advanceNBlock(blocksPerHour);
      }
      fTokenBalance = new BigNumber(await vault.balanceOf(farmer1));
      await vault.withdraw(fTokenBalance, { from: farmer1 });
      let farmerNewBalance = new BigNumber(await underlying.balanceOf(farmer1));
      Utils.assertBNGt(farmerNewBalance, farmerOldBalance);

      apr =
        (farmerNewBalance.toFixed() / farmerOldBalance.toFixed() - 1) *
        (24 / ((blocksPerHour * hours) / 300)) *
        365;
      apy =
        ((farmerNewBalance.toFixed() / farmerOldBalance.toFixed() - 1) *
          (24 / ((blocksPerHour * hours) / 300)) +
          1) **
        365;

      console.log("earned!");
      console.log("Overall APR:", apr * 100, "%");
      console.log("Overall APY:", (apy - 1) * 100, "%");

      await strategy.withdrawAllToVault({ from: governance }); // making sure can withdraw all for a next switch
    });
  });
});
