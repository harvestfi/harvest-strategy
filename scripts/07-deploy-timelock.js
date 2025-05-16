const { type2Transaction } = require('./utils.js');
const TimelockCont = artifacts.require('Timelock');
const addresses = require('../test/test-config.js');

async function main() {
  console.log("Deploy the Timelock contract");

  const timelock = await type2Transaction(TimelockCont.new, addresses.Governance, addresses.Storage);
  console.log("Timelock deployed at:", timelock.creates);

  console.log("Deployment complete.");
  await hre.run("verify:verify", {address: timelock.creates, constructorArguments: [addresses.Governance, addresses.Storage]}); 
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });