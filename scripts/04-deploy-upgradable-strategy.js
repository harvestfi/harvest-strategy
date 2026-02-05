const prompt = require('prompt');
const hre = require("hardhat");
const { type2Transaction } = require('./utils.js');

async function getFeeData() {
  const feeData = await ethers.provider.getFeeData();
  feeData.maxPriorityFeePerGas = 0.1e9;
  if (feeData.maxFeePerGas > 50e9) {
    feeData.maxFeePerGas = 50e9;
  }
  return feeData;
}

async function main() {
  console.log("Upgradable strategy deployment.");
  console.log("Specify a the vault address, and the strategy implementation's name");
  prompt.start();
  const addresses = require("../test/test-config.js");

  const {vaultAddr, strategyName} = await prompt.get(['vaultAddr', 'strategyName']);

  const StrategyImpl = artifacts.require(strategyName);
  const feeData = await getFeeData();
  const impl = await StrategyImpl.new({ maxFeePerGas: feeData.maxFeePerGas, maxPriorityFeePerGas: feeData.maxPriorityFeePerGas });

  console.log("Implementation deployed at:", impl.address);
  await new Promise(r => setTimeout(r, 2000))

  const StrategyProxy = artifacts.require('StrategyProxy');
  const proxy = await StrategyProxy.new(impl.address, { maxFeePerGas: feeData.maxFeePerGas, maxPriorityFeePerGas: feeData.maxPriorityFeePerGas });
  console.log("Proxy deployed at:", proxy.address, );
  await new Promise(r => setTimeout(r, 2000))

  const strategy = await StrategyImpl.at(proxy.address);
  await type2Transaction(strategy.initializeStrategy, addresses.Storage, vaultAddr);

  console.log("Deployment complete. New strategy deployed and initialised at", proxy.address);
  console.log(
`{
  "vault": "${vaultAddr}",
  "newStrategy": "${proxy.address}"
}`
  )
  try {
    await hre.run("verify:verify", {address: impl.address}); 
  } catch (e) {
    console.log("Verification failed:", e);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
