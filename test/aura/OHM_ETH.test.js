const config = require('./import/OHM_ETH.config.json');
const { AuraULTest } = require("./utils/ul.test.js");

//This test was developed at blockNumber 16854800
const Strategy = artifacts.require("AuraStrategyMainnet_OHM_ETH");

// Vanilla Mocha test. Increased compatibility with tools that integrate Mocha.
describe("Mainnet Aura OHM-ETH pool", function() {
  let auraULTest = new AuraULTest();

  before(async function() {
    const result = await auraULTest.setupTest(
      config.lpTokens.OHM_ETH.address, 
      config.lpTokens.OHM_ETH.whale,
      [],
      [],
      Strategy
    );
  });

  describe("Happy path", function() {
    it("Farmer should earn money", async function() {
      await auraULTest.testHappyPath(config.relatedTokens.aura, true);
    });
  });
});
