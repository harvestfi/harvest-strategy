const { ConvexULTest } = require("./util/convex-ul-test.js");

//This test was developed at blockNumber 17413400
const strategyArtifact = artifacts.require("ConvexStrategyMainnet_crvUSD_USDT");

// Vanilla Mocha test. Increased compatibility with tools that integrate Mocha.
describe("Mainnet Convex crvUSD-USDT", function() {
  // test setup
  const underlying = "0x390f3595bCa2Df7d23783dFd126427CCeb997BF4";
  const underlyingWhale = "0x8A60480fEB6aE66a279A3b998a6989B6948c4d31";
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
