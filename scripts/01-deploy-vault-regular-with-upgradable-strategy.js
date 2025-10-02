const prompt = require('prompt');
const hre = require("hardhat");
const { type2Transaction } = require('./utils.js');

function cleanupObj(d) {
  for (let i = 0; i < 10; i++) delete d[String(i)];
  delete d["vaultType"];
  return d;
}

async function getFeeData() {
  const feeData = await ethers.provider.getFeeData();
  feeData.maxPriorityFeePerGas = 0.2e9;
  if (feeData.maxFeePerGas > 50e9) {
    feeData.maxFeePerGas = 50e9;
  }
  return feeData;
}

async function main() {
  console.log("Regular vault deployment with upgradable strategy.");
  console.log("> Prerequisite: deploy upgradable strategy implementation");
  console.log("Specify a unique ID (for the JSON), vault's underlying token address, and upgradable strategy implementation address");
  prompt.start();
  const addresses = require("../test/test-config.js");
  const MegaFactory = artifacts.require("MegaFactory");

  const {id, underlying, strategyName} = await prompt.get(['id', 'underlying', 'strategyName']);
  const factory = await MegaFactory.at(addresses.Factory.MegaFactory);

  const StrategyImpl = artifacts.require(strategyName);
  const feeData = await getFeeData();
  const impl = await StrategyImpl.new({ maxFeePerGas: feeData.maxFeePerGas, maxPriorityFeePerGas: feeData.maxPriorityFeePerGas });
  console.log("Implementation deployed at:", impl.address);

  await type2Transaction(factory.createRegularVaultUsingUpgradableStrategy, id, underlying, impl.address)

  const deployment = cleanupObj(await factory.completedDeployments(id));
  console.log("======");
  console.log(`${id}: ${JSON.stringify(deployment, null, 2)}`);
  console.log("======");

  await hre.run("verify:verify", {address: impl.address}); 

  console.log("Deployment complete. Add the JSON above to `harvest-api` (https://github.com/harvest-finance/harvest-api/blob/master/data/mainnet/addresses.json) repo and add entries to `tokens.js` and `pools.js`.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
