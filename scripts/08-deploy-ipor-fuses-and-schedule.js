const prompt = require('prompt');
const hre = require("hardhat");
const { type2Transaction } = require('./utils.js');


async function main() {
  console.log("Deploy a set of IPOR Fuses");
  console.log("Specify the sequential marketId");
  prompt.start();
  const addresses = require("../test/test-config.js");
  const BlanceFuseContr = artifacts.require('Erc4626BalanceFuse');
  const SupplyFuseContr = artifacts.require('Erc4626SupplyFuse');
  const IPlasmaVault = artifacts.require("IPlasmaVault");
  const Timelock = artifacts.require("Timelock");

  const {id, vaultAddr, autoPilot} = await prompt.get(['id', 'vaultAddr', 'autoPilot']);

  const balanceFuse = await type2Transaction(BlanceFuseContr.new, id);
  console.log("Balance Fuse deployed at:", balanceFuse.creates);

  const supplyFuse = await type2Transaction(SupplyFuseContr.new, id);
  console.log("Supply Fuse deployed at:", supplyFuse.creates);

  const plasmaVault = await IPlasmaVault.at(autoPilot);
  const timelock = await Timelock.at(addresses.Timelock);

  const tx1 = await plasmaVault.addFuses.request([supplyFuse.creates])
  const tx2 = await plasmaVault.addBalanceFuse.request(id, balanceFuse.creates)
  const tx3 = await plasmaVault.grantMarketSubstrates.request(id, [web3.utils.padLeft(vaultAddr, 64)])

  await timelock.scheduleBatch([tx1.to, tx2.to, tx3.to], [0, 0, 0], [tx1.data, tx2.data, tx3.data], '0x0', '0x0', 259200)

  console.log("Deployment complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });