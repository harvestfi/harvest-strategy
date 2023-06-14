const { ConvexULTest } = require("./util/convex-ul-test.js");

//This test was developed at blockNumber 17472700
const strategyArtifact = artifacts.require("ConvexStrategyMainnet_stETH_ng");

// Vanilla Mocha test. Increased compatibility with tools that integrate Mocha.
describe("Mainnet Convex stETH_ng", function() {
  // test setup
  const underlying = "0x21E27a5E5513D6e65C4f830167390997aA84843a";
  const underlyingWhale = "0x0FCbf9A4398C15d6609580879681Aa5382FF8542";
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
