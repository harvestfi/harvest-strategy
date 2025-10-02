const prompt = require('prompt');
const hre = require("hardhat");
const { type2Transaction } = require('./utils.js');


async function main() {
  console.log("Deploy a set of IPOR Fuses");
  console.log("Specify the sequential marketId");
  prompt.start();
  const BlanceFuseContr = artifacts.require('Erc4626BalanceFuse');
  const SupplyFuseContr = artifacts.require('Erc4626SupplyFuse');

  const {id} = await prompt.get(['id']);

  const balanceFuse = await BlanceFuseContr.new(id);
  console.log("Balance Fuse deployed at:", balanceFuse.address);

  const supplyFuse = await SupplyFuseContr.new(id);
  console.log("Supply Fuse deployed at:", supplyFuse.address);

  console.log("Deployment complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });