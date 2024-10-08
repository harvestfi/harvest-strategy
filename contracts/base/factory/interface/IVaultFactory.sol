// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.26;

interface IVaultFactory {
  function deploy(address _storage, address _underlying) external returns (address);
  function info(address vault) external view returns(address Underlying, address NewVault);
}
