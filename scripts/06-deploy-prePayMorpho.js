const { type2Transaction } = require('./utils.js');
const PrePayContr = artifacts.require('RewardPrePayMorhpo');
const addresses = require('../test/test-config.js');

async function main() {
  console.log("Deploy the Morpho PrePay contract");

  const prePay = await type2Transaction(PrePayContr.new, addresses.Storage);
  console.log("Morpho PrePay deployed at:", prePay.creates);

  await hre.run("verify:verify", {address: prePay.creates, constructorArguments: [addresses.Storage]}); 

  console.log("Deployment complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });