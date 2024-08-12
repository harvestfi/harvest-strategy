const makeVault = require("./make-vault.js");
const addresses = require("../test-config.js");
const IController = artifacts.require("IController");
const IRewardForwarder = artifacts.require("IRewardForwarder");
const Storage = artifacts.require("Storage");
const Vault = artifacts.require("VaultV2");
const ILiquidatorRegistry = artifacts.require("IUniversalLiquidatorRegistry");
const IUpgradeableStrategy = artifacts.require("IUpgradeableStrategy");
const IDex = artifacts.require("IDex");

const IVault = artifacts.require("IVault");
const Utils = require("./Utils.js");

async function impersonates(targetAccounts){
  console.log("Impersonating...");
  for(i = 0; i < targetAccounts.length ; i++){
    console.log(targetAccounts[i]);
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [
        targetAccounts[i]
      ]
    });
  }
}

async function setupCoreProtocol(config) {
  if(config.existingVaultAddress != null){
    vault = await IVault.at(config.existingVaultAddress);
    console.log("Fetching Vault at: ", vault.address);
  } else {
    const implAddress = config.vaultImplementationOverride || addresses.VaultImplementationV2;
    vault = await makeVault(implAddress, addresses.Storage, config.underlying.address, 100, 100, {
      from: config.governance,
    });
    console.log("New Vault Deployed: ", vault.address);
  }

  storage = await Storage.at(addresses.Storage);
  controller = await IController.at(addresses.Controller);
  feeRewardForwarder = await IRewardForwarder.at(await controller.rewardForwarder());

  let rewardPool = null;

  if (!config.rewardPoolConfig) {
    config.rewardPoolConfig = {};
  }
  // if reward pool is required, then deploy it
  if(config.rewardPool != null && config.existingRewardPoolAddress == null) {
    const rewardTokens = config.rewardPoolConfig.rewardTokens || [addresses.FARM];
    const rewardDistributions = [config.governance];
    if (config.feeRewardForwarder) {
      rewardDistributions.push(config.feeRewardForwarder);
    }

    if (config.rewardPoolConfig.type === 'PotPool') {
      const PotPool = artifacts.require("PotPool");
      console.log("reward pool needs to be deployed");
      rewardPool = await PotPool.new(
        rewardTokens,
        vault.address,
        64800,
        rewardDistributions,
        addresses.Storage,
        "fPool",
        "fPool",
        18,
        {from: config.governance }
      );
      console.log("New PotPool deployed: ", rewardPool.address);
    } else {
      const NoMintRewardPool = artifacts.require("NoMintRewardPool");
      console.log("reward pool needs to be deployed");
      rewardPool = await NoMintRewardPool.new(
        rewardTokens[0],
        vault.address,
        64800,
        rewardDistributions[0],
        addresses.Storage,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        {from: config.governance }
      );
      console.log("New NoMintRewardPool deployed: ", rewardPool.address);
    }
  } else if(config.existingRewardPoolAddress != null) {
    const NoMintRewardPool = artifacts.require("NoMintRewardPool");
    rewardPool = await NoMintRewardPool.at(config.existingRewardPoolAddress);
    console.log("Fetching Reward Pool deployed: ", rewardPool.address);
  }

  let universalLiquidatorRegistry = await ILiquidatorRegistry.at(addresses.UniversalLiquidatorRegistry);

  // set liquidation paths
  if(config.liquidation) {
    for (i=0;i<config.liquidation.length;i++) {
      dex = Object.keys(config.liquidation[i])[0];
      await universalLiquidatorRegistry.setPath(
        web3.utils.keccak256(dex),
        config.liquidation[i][dex],
        {from: config.ULOwner}
      );
    }
  }

  // default arguments are storage and vault addresses
  config.strategyArgs = config.strategyArgs || [
    addresses.Storage,
    vault.address
  ];

  for(i = 0; i < config.strategyArgs.length ; i++){
    if(config.strategyArgs[i] == "storageAddr") {
      config.strategyArgs[i] = addresses.Storage;
    } else if(config.strategyArgs[i] == "vaultAddr") {
      config.strategyArgs[i] = vault.address;
    } else if(config.strategyArgs[i] == "poolAddr" ){
      config.strategyArgs[i] = rewardPool.address;
    } else if(config.strategyArgs[i] == "universalLiquidatorRegistryAddr"){
      config.strategyArgs[i] = universalLiquidatorRegistry.address;
    }
  }

  let strategyImpl = null;

  if (!config.strategyArtifactIsUpgradable) {
    strategy = await config.strategyArtifact.new(
      ...config.strategyArgs,
      { from: config.governance }
    );
  } else {
    strategyImpl = await config.strategyArtifact.new();
    const StrategyProxy = artifacts.require("StrategyProxy");

    const strategyProxy = await StrategyProxy.new(strategyImpl.address);
    strategy = await config.strategyArtifact.at(strategyProxy.address);
    await strategy.initializeStrategy(
      ...config.strategyArgs,
      { from: config.governance }
    );
  }

  console.log("Strategy Deployed: ", strategy.address);

  if (config.announceStrategy === true) {
    // Announce switch, time pass, switch to strategy
    await vault.announceStrategyUpdate(strategy.address, { from: config.governance });
    console.log("Strategy switch announced. Waiting...");
    await Utils.waitHours(13);
    await vault.setStrategy(strategy.address, { from: config.governance });
    await vault.setVaultFractionToInvest(100, 100, { from: config.governance });
    console.log("Strategy switch completed.");
  } else if (config.upgradeStrategy === true) {
    // Announce upgrade, time pass, upgrade the strategy
    const strategyAsUpgradable = await IUpgradeableStrategy.at(await vault.strategy());
    await strategyAsUpgradable.scheduleUpgrade(strategyImpl.address, { from: config.governance });
    console.log("Upgrade scheduled. Waiting...");
    await Utils.waitHours(13);
    await strategyAsUpgradable.upgrade({ from: config.governance });
    await vault.setVaultFractionToInvest(100, 100, { from: config.governance });
    strategy = await config.strategyArtifact.at(await vault.strategy());
    console.log("Strategy upgrade completed.");
  } else if (config.existingVaultAddress) {
    strategy = await config.strategyArtifact.at(await vault.strategy());
  } else {
    await vault.setStrategy(strategy.address, {from: config.governance});
  }

  // set liquidation paths
  if(config.uniV3Fee) {
    const dex = await IDex.at("0xc1D0465FF243fEcE2856Eac534C16cf1C8fb1aBA");
    for (i=0;i<config.uniV3Fee.length;i++) {
      await dex.setFee(config.uniV3Fee[i][0], config.uniV3Fee[i][1], config.uniV3Fee[i][2], {from: config.ULOwner})
    }
  }
  if(config.balPool) {
    const dex = await IDex.at("0x2F04b8a306C482D9d9fdca083e2b9Ad20F74eA05");
    for (i=0;i<config.balPool.length;i++) {
      await dex.setPool(config.balPool[i][0], config.balPool[i][1], config.balPool[i][2], {from: config.ULOwner})
    }
  }
  
  if (config.existingVaultAddress){
    const vaultAsUpgradable = await IUpgradeableStrategy.at(config.existingVaultAddress);
    const impl = await Vault.new();
    await vaultAsUpgradable.scheduleUpgrade(impl.address, { from: config.governance });
    console.log("Vault upgrade scheduled. Waiting...");
    await Utils.waitHours(13);
    await vaultAsUpgradable.upgrade({ from: config.governance });
  }

  return [controller, vault, strategy, rewardPool];
}

async function depositVault(_farmer, _underlying, _vault, _amount) {
  await _underlying.approve(_vault.address, _amount, { from: _farmer });
  await _vault.deposit(_amount, _farmer, { from: _farmer });
}

async function setupFactory() {
  const MegaFactory = artifacts.require("MegaFactory");
  const PotPoolFactory = artifacts.require("PotPoolFactory");
  const RegularVaultFactory = artifacts.require("RegularVaultFactory");
  const UpgradableStrategyFactory = artifacts.require("UpgradableStrategyFactory");
  const OwnableWhitelist = artifacts.require("OwnableWhitelist");

  const vaultFactory = await RegularVaultFactory.new();
  const potPoolFactory = await PotPoolFactory.new();
  const megaFactory = await MegaFactory.new(
    "0xc95CbE4ca30055c787CB784BE99D6a8494d0d197", // storage
    "0xF49440C1F012d041802b25A73e5B0B9166a75c02" // multisig
  );
  const upgradableStrategyFactory = await UpgradableStrategyFactory.new();

  const uniV3FactoryAddress = "0x5eaAb98ce0Ca4EE3e0dF52EDb8f0EA02fC86038c";
  const uniV3Factory = await OwnableWhitelist.at(uniV3FactoryAddress);

  await megaFactory.setVaultFactory(1 /* VaultType.Regular */, vaultFactory.address);
  await megaFactory.setVaultFactory(2 /* VaultType.UniV3 */, uniV3FactoryAddress); // deployed separately

  await uniV3Factory.setWhitelist(megaFactory.address, true);

  await megaFactory.setPotPoolFactory(potPoolFactory.address);
  await megaFactory.setStrategyFactory(1 /* StrategyType.Upgradable */, upgradableStrategyFactory.address);

  await potPoolFactory.setWhitelist(megaFactory.address, true);
  await vaultFactory.setWhitelist(megaFactory.address, true);
  await upgradableStrategyFactory.setWhitelist(megaFactory.address, true);

  return [megaFactory, potPoolFactory];
}

module.exports = {
  impersonates,
  setupCoreProtocol,
  depositVault,
  setupFactory,
};