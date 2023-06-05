const { ConvexULTest } = require("./util/convex-ul-test.js");

//This test was developed at blockNumber 17413400
const strategyArtifact = artifacts.require("ConvexStrategyMainnet_crvUSD_USDC");

// Vanilla Mocha test. Increased compatibility with tools that integrate Mocha.
describe("Mainnet Convex crvUSD-USDC", function() {
  // test setup
  const underlying = "0x4DEcE678ceceb27446b35C672dC7d61F30bAD69E";
  const underlyingWhale = "0xe4F077BF767a57Ae9aAD77B0aB54CbdE0BEde65A";
  const liquidationPaths = [
  ];

  let convexULTest = new ConvexULTest();

  before(async () => {
    await convexULTest.setupTest(underlying, underlyingWhale, liquidationPaths, strategyArtifact);
  });

  describe("--------- Happy path --------------", () => {
    it("Farmer should earn money", async () => {
      await convexULTest.testHappyPath();
    });
  });
});
