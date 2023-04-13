const config = require('./import/OHM_DAI.config.json');
const { AuraULTest } = require("./utils/ul.test.js");

//This test was developed at blockNumber 17037400
const Strategy = artifacts.require("AuraStrategyMainnet_OHM_DAI");

// Vanilla Mocha test. Increased compatibility with tools that integrate Mocha.
describe("Mainnet Aura OHM-DAI pool", function() {
  let auraULTest = new AuraULTest();

  before(async function() {
    const result = await auraULTest.setupTest(
      config.lpTokens.OHM_DAI.address, 
      config.lpTokens.OHM_DAI.whale,
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
