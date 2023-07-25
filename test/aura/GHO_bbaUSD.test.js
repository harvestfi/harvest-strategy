const config = require('./import/GHO_bbaUSD.config.json');
const { AuraULTest } = require("./utils/ul.test.js");

//This test was developed at blockNumber 17770500
const Strategy = artifacts.require("AuraStrategyMainnet_GHO_bbaUSD");

// Vanilla Mocha test. Increased compatibility with tools that integrate Mocha.
describe("Mainnet Aura GHO - bb-a-USD pool", function() {
  let auraULTest = new AuraULTest();

  before(async function() {
    const result = await auraULTest.setupTest(
      config.lpTokens.gho_bb_a_USD.address, 
      config.lpTokens.gho_bb_a_USD.whale,
      [{"balancer": [config.relatedTokens.aura, config.relatedTokens.wETH]}], 
      config.setLiquidationPath,
      Strategy);
  });

  describe("Happy path", function() {
    it("Farmer should earn money", async function() {
      await auraULTest.testHappyPath(config.relatedTokens.aura, true);
    });
  });
});
