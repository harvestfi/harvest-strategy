// The loss carry (high-water mark) follows the holders who leave.
//
// lossCarry is an absolute amount of underlying the position must earn back before a
// fee is charged again. It belongs to the holders who bore the loss. When some of them
// exit they take their share of the loss with them, so their share of the carry has to
// go too - left whole, the carry would shield a much smaller position, and anyone who
// deposits after, from the fee on genuinely new profit. Every exit path scales it: an
// in-kind exit by its exact share, a withdrawal through the vault by what leaves the
// strategy, a full withdrawal to zero.
//
// Developed and tested at blockNumber 25933440

const { impersonates, setupCoreProtocol, depositVault } = require("../utilities/hh-utils.js");

const addresses = require("../test-config.js");
const BigNumber = require("bignumber.js");
const { ethers, network } = require("hardhat");

const IERC20 = artifacts.require("IERC20");
const VaultV2InKind = artifacts.require("VaultV2InKind");
const Strategy = artifacts.require("IPORLendingStrategyMainnet_bdUSD");

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_BALANCES_SLOT = 9;
const FTOKEN = "0xF8F226dA66244F89e70C5B5D1a5C5b0d505Eb1d8";
const DEPOSIT = "50000000000"; // 50,000 USDC each
const num = (x) => Number(new BigNumber(x).toFixed());

describe("Mainnet IPOR Fusion - the loss carry leaves with the holders who exit", function () {
  let accounts, governance, farmer1, farmer2, sink;
  let underlying, pv;

  before(async function () {
    governance = addresses.Governance;
    accounts = await web3.eth.getAccounts();
    farmer1 = accounts[1]; farmer2 = accounts[2]; sink = accounts[7];
    await impersonates([governance]);
    await web3.eth.sendTransaction({ from: accounts[9], to: governance, value: 10e18 });
    underlying = await IERC20.at(USDC);
    pv = await IERC20.at(FTOKEN);
  });

  async function fund(who, amount) {
    const key = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [who, USDC_BALANCES_SLOT]));
    await network.provider.send("hardhat_setStorageAt", [USDC, key, ethers.utils.hexZeroPad(ethers.BigNumber.from(amount).toHexString(), 32)]);
  }

  // Fresh vault + strategy, two equal holders, everything supplied, then a 5% dip in
  // the position's value: shares moved out of the strategy, with the loss carried.
  async function deployAndDip() {
    const impl = await VaultV2InKind.new({ from: governance });
    const [controller, v, strategy] = await setupCoreProtocol({
      existingVaultAddress: null, vaultImplementationOverride: impl.address,
      strategyArtifact: Strategy, strategyArtifactIsUpgradable: true, underlying, governance,
    });
    const vault = await VaultV2InKind.at(v.address);
    await fund(farmer1, DEPOSIT); await fund(farmer2, DEPOSIT);
    await depositVault(farmer1, underlying, vault, DEPOSIT);
    await depositVault(farmer2, underlying, vault, DEPOSIT);
    await controller.doHardWork(vault.address, { from: governance });
    await network.provider.send("evm_mine");
    await vault.setRedeemInKindEnabled(true, { from: governance });

    await impersonates([strategy.address]);
    await web3.eth.sendTransaction({ from: accounts[9], to: strategy.address, value: 1e18 });
    const moved = new BigNumber(await pv.balanceOf(strategy.address)).idiv(20).toFixed();
    await pv.transfer(sink, moved, { from: strategy.address });
    await strategy.doHardWork({ from: governance });
    const carry = num(await strategy.lossCarry());
    assert.isTrue(carry > 0, "precondition: a loss must be carried");
    return { vault, strategy, controller, moved, carry };
  }

  it("an in-kind exit takes its exact share of the carry, and the stayers pay on new profit", async function () {
    const { vault, strategy, moved, carry } = await deployAndDip();

    // farmer1 holds half the supply and leaves in kind.
    const shares = (await vault.balanceOf(farmer1)).toString();
    const fraction = num(shares) / num(await vault.totalSupply());
    await vault.redeemInKind(shares, farmer1, farmer1, { from: farmer1 });
    const carryAfterExit = num(await strategy.lossCarry());
    console.log("  lossCarry", carry, "->", carryAfterExit, "after a", (fraction * 100).toFixed(2) + "% in-kind exit");
    assert.approximately(carryAfterExit / (carry * (1 - fraction)), 1, 1e-6, "the carry must scale by the share that left");

    // The dip's shares come back. That is twice the stayers' own loss: half of it is a
    // recovery, the other half is profit nobody currently holding lost - and it is taxed.
    const stored = num(await strategy.storedBalance());
    const feeBefore = num(await strategy.pendingFee());
    await pv.transfer(strategy.address, moved, { from: sink });
    const gain = num(await strategy.currentBalance()) - stored;
    // syncBalance accrues without paying, so the fee can be read off pendingFee exactly.
    await strategy.syncBalance({ from: governance });
    const charged = num(await strategy.pendingFee()) - feeBefore;
    const rate = num(await strategy.totalFeeNumerator()) / num(await strategy.feeDenominator());
    const expected = Math.floor((gain - carryAfterExit) * rate);
    console.log("  gain", gain, "| carry repaid", carryAfterExit, "| fee charged", charged, "(expected", expected + ", was 0 with the carry left whole)");
    assert.isTrue(gain > carryAfterExit, "precondition: the gain must exceed the stayers' carry");
    assert.approximately(charged / expected, 1, 1e-4, "only the excess over the scaled carry is charged");
    assert.equal(num(await strategy.lossCarry()), 0, "the recovery clears the carry");
  });

  it("a withdrawal through the vault scales the carry by what leaves the strategy", async function () {
    const { vault, strategy, carry } = await deployAndDip();

    const before = num(await strategy.investedUnderlyingBalance());
    const half = new BigNumber(await vault.balanceOf(farmer1)).idiv(2).toFixed();
    await vault.methods["withdraw(uint256)"](half, { from: farmer1 });
    const after = num(await strategy.investedUnderlyingBalance());
    const left = 1 - after / before;
    const carryAfter = num(await strategy.lossCarry());
    console.log("  strategy value", before, "->", after, "(" + (left * 100).toFixed(2) + "% left) | lossCarry", carry, "->", carryAfter);
    assert.isTrue(left > 0.2, "precondition: a quarter of the supply left");
    assert.approximately(carryAfter / (carry * (1 - left)), 1, 1e-3, "the carry must scale by the value that left");
  });

  it("a full withdrawal to the vault clears the carry", async function () {
    const { strategy, carry } = await deployAndDip();
    await strategy.withdrawAllToVault({ from: governance });
    console.log("  lossCarry", carry, "->", num(await strategy.lossCarry()), "after withdrawAllToVault");
    assert.equal(num(await strategy.lossCarry()), 0, "nothing is invested, nothing is left to earn back");
  });
});
