// In-kind redemption pays BOTH legs: the strategy's idle underlying and its position.
//
// The strategy holds idle underlying whenever a supply is deferred - the PlasmaVault's
// deposit cap, a paused market, a closed one. Before this change an in-kind exit paid
// only the position, so that idle was invisible to the redeemer. The fee is carved out
// once, from idle first and the remainder from the position, the way `_handleFee` pays it.
//
// Developed and tested at blockNumber 25933440

const Utils = require("../utilities/Utils.js");
const { impersonates, setupCoreProtocol, depositVault } = require("../utilities/hh-utils.js");

const addresses = require("../test-config.js");
const BigNumber = require("bignumber.js");
const { ethers, network } = require("hardhat");

const IERC20 = artifacts.require("IERC20");
const IERC4626 = artifacts.require("contracts/base/interface/IERC4626.sol:IERC4626");
const VaultV2InKind = artifacts.require("VaultV2InKind");
const Strategy = artifacts.require("IPORLendingStrategyMainnet_bdUSD");

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_BALANCES_SLOT = 9;
const FTOKEN = "0xF8F226dA66244F89e70C5B5D1a5C5b0d505Eb1d8";
const DEPOSIT = "50000000000"; // 50,000 USDC each
const num = (x) => Number(new BigNumber(x).toFixed());

describe("Mainnet IPOR Fusion - in-kind pays idle and position", function () {
  let accounts, governance, farmer1, farmer2, donor;
  let underlying, fToken, pv;

  before(async function () {
    governance = addresses.Governance;
    accounts = await web3.eth.getAccounts();
    farmer1 = accounts[1]; farmer2 = accounts[2]; donor = accounts[3];
    await impersonates([governance]);
    await web3.eth.sendTransaction({ from: accounts[9], to: governance, value: 10e18 });
    underlying = await IERC20.at(USDC);
    fToken = await IERC4626.at(FTOKEN);
    pv = await IERC20.at(FTOKEN);
  });

  async function fund(who, amount) {
    const key = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [who, USDC_BALANCES_SLOT]));
    await network.provider.send("hardhat_setStorageAt", [USDC, key, ethers.utils.hexZeroPad(ethers.BigNumber.from(amount).toHexString(), 32)]);
  }

  // Fresh vault + strategy, two equal holders, everything supplied.
  async function deploy() {
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
    await network.provider.send("evm_mine"); // clear the redemption lock the supply armed
    await vault.setRedeemInKindEnabled(true, { from: governance });
    return { vault, strategy, controller };
  }

  // Both legs, given the strategy's state, for a holder owning `fraction` of supply.
  async function expectedLegs(strategy, fraction) {
    const idle = num(await underlying.balanceOf(strategy.address));
    const shares = num(await pv.balanceOf(strategy.address));
    const fee = num(await strategy.pendingFee());
    const feeFromIdle = Math.min(fee, idle);
    const feeFromPosition = fee - feeFromIdle;
    const feeShares = feeFromPosition > 0 ? num(await fToken.previewWithdraw(String(feeFromPosition))) : 0;
    return { idle, shares, fee, feeFromIdle, feeShares,
             assets: Math.floor((idle - feeFromIdle) * fraction),
             pool: Math.floor(Math.max(shares - feeShares, 0) * fraction) };
  }

  async function redeemAndCheck(vault, strategy, who, bystander, label) {
    const shares = new BigNumber(await vault.balanceOf(who)).toFixed();
    const fraction = num(shares) / num(await vault.totalSupply());
    const tvl = num(await strategy.investedUnderlyingBalance());
    const exp = await expectedLegs(strategy, fraction);
    const pps0 = num(await vault.getPricePerFullShare());
    const ent0 = num(await vault.underlyingBalanceWithInvestmentForHolder(bystander));

    const [pA, pP] = Object.values(await vault.previewRedeemInKind(shares));
    const a0 = num(await underlying.balanceOf(who)), p0 = num(await pv.balanceOf(who));
    await vault.redeemInKind(shares, who, who, { from: who });
    const gotA = num(await underlying.balanceOf(who)) - a0;
    const gotP = num(await pv.balanceOf(who)) - p0;

    console.log(`  [${label}] idle ${exp.idle} | position ${exp.shares} | pendingFee ${exp.fee} (from idle ${exp.feeFromIdle}, from position ${exp.feeShares} shares)`);
    console.log(`  [${label}] received underlying ${gotA} (expected ${exp.assets}, preview ${num(pA)})`);
    console.log(`  [${label}] received position   ${gotP} (expected ${exp.pool}, preview ${num(pP)})`);

    // preview tracks execution (a block passes between them)
    if (num(pA) > 0) assert.approximately(gotA / num(pA), 1, 1e-7, "assets preview must track execution"); else assert.equal(gotA, 0);
    assert.approximately(gotP / num(pP), 1, 1e-7, "pool-shares preview must track execution");
    // the carve rule
    if (exp.assets > 0) assert.approximately(gotA / exp.assets, 1, 1e-6, "idle leg must be pro-rata of idle net of the fee"); else assert.equal(gotA, 0);
    assert.approximately(gotP / exp.pool, 1, 1e-6, "position leg must be pro-rata of the position net of remaining fee");
    // both legs together are the pro-rata slice of value (gross-marked position)
    const value = gotA + num(await fToken.convertToAssets(String(gotP)));
    assert.approximately(value / (tvl * fraction), 1, 3e-3, "legs must sum to the pro-rata slice of TVL");
    // nobody else moves
    const pps1 = num(await vault.getPricePerFullShare());
    const ent1 = num(await vault.underlyingBalanceWithInvestmentForHolder(bystander));
    assert.approximately(pps1 / pps0, 1, 2e-4, "in-kind exit must not reprice the remaining holder");
    assert.approximately(ent1 / ent0, 1, 2e-4, "remaining holder keeps their entitlement");
    return { gotA, gotP };
  }

  it("fee smaller than idle: fee comes wholly out of idle, position leg untouched", async function () {
    const { vault, strategy } = await deploy();
    // A deferred supply: 20,000 USDC idle in the strategy on top of the position.
    await fund(strategy.address, "20000000000");
    await strategy.syncBalance({ from: governance });
    assert.isTrue(num(await strategy.pendingFee()) < num(await underlying.balanceOf(strategy.address)), "precondition: fee < idle");
    const { gotA, gotP } = await redeemAndCheck(vault, strategy, farmer1, farmer2, "fee<idle");
    assert.isTrue(gotA > 0 && gotP > 0, "both legs must be paid - the idle leg was 0 before this change");
  });

  it("fee larger than idle: idle is consumed by the fee, the remainder is carved from the position", async function () {
    const { vault, strategy } = await deploy();
    // A gain nobody has harvested yet (10,000 USDC gifted to the position) accrues a fee of
    // ~1,500 USDC; only 500 USDC is idle, so 1,000 of it must come out of the position.
    await fund(donor, "10000000000");
    await underlying.approve(FTOKEN, "10000000000", { from: donor });
    await fToken.deposit("10000000000", strategy.address, { from: donor });
    await network.provider.send("evm_mine");
    await fund(strategy.address, "500000000");
    await strategy.syncBalance({ from: governance }); // accrues the fee, refreshes storedBalance
    const idle = num(await underlying.balanceOf(strategy.address)), fee = num(await strategy.pendingFee());
    assert.isTrue(fee > idle, "precondition: fee > idle (" + fee + " vs " + idle + ")");
    const { gotA, gotP } = await redeemAndCheck(vault, strategy, farmer1, farmer2, "fee>idle");
    assert.equal(gotA, 0, "idle is entirely backing the fee, so the idle leg must be zero");
    assert.isTrue(gotP > 0, "the position leg is paid net of the remaining fee");
  });

  it("with no idle at all, behaves exactly as before: position only", async function () {
    const { vault, strategy } = await deploy();
    const { gotA, gotP } = await redeemAndCheck(vault, strategy, farmer1, farmer2, "no idle");
    assert.isTrue(gotA <= 1e3, "at most dust of idle"); // residual under the supply floor
    assert.isTrue(gotP > 0);
  });
});
