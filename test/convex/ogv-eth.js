const { ConvexULTest } = require("./util/convex-ul-test.js");

const crv = "0xD533a949740bb3306d119CC777fa900bA034cd52";
const cvx = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

//This test was developed at blockNumber 17074600
const strategyArtifact = artifacts.require("ConvexStrategyMainnet_OGV_ETH");

// Vanilla Mocha test. Increased compatibility with tools that integrate Mocha.
describe("Mainnet Convex OGV-ETH", function() {
  // test setup
  const underlying = "0x8109A51542294cDBB489AE5516f42FfBD92177aa";
  const underlyingWhale = "0xDA47608D196c23D63c8A7a3eC9E4b74A2A26e0dC";
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
