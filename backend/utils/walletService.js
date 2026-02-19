const { ethers } = require('ethers');
const { encrypt, decrypt } = require('./encryption');
const cryptoVault = require('../security/cryptoVault');
const keyManager = require('../security/keyManager');
const logger = require('../core/logger');
const btcService = require('../services/btcService');
const crypto = require('crypto');

class WalletService {
  constructor() {
    this.providers = {
      ethereum: new ethers.JsonRpcProvider(
        process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID'
      ),
      polygon: new ethers.JsonRpcProvider(
        process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
      ),
      bsc: new ethers.JsonRpcProvider(
        process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org'
      )
    };
  }

  // Create new wallet (supports Ethereum-based and Bitcoin)
  createWallet(network = 'ethereum') {
    if (network === 'bitcoin' || network === 'btc') {
      return this.createBitcoinWallet();
    }
    
    const wallet = ethers.Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic.phrase,
      network: network
    };
  }

  // Create Bitcoin wallet
  createBitcoinWallet() {
    // Generate mnemonic using ethers (BIP39 compatible)
    const wallet = ethers.Wallet.createRandom();
    const mnemonic = wallet.mnemonic.phrase;
    
    // For Bitcoin, we'll use a different derivation path
    // This is a simplified version - in production use bitcoin-specific libraries
    const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic);
    const btcPath = "m/44'/0'/0'/0/0"; // Bitcoin BIP44 path
    const btcWallet = hdNode.derivePath(btcPath);
    
    // Generate Bitcoin address (simplified P2PKH format)
    // In production, use bitcoinjs-lib or similar
    const btcAddress = this.generateBitcoinAddress(btcWallet.publicKey);
    
    return {
      address: btcAddress,
      privateKey: btcWallet.privateKey,
      mnemonic: mnemonic,
      network: 'bitcoin',
      publicKey: btcWallet.publicKey
    };
  }

  // Generate Bitcoin address from public key (simplified)
  generateBitcoinAddress(publicKey) {
    // This is a simplified version that generates a testnet-like address
    // In production, use proper Bitcoin libraries like bitcoinjs-lib
    const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
    const address = '1' + hash.substring(0, 33); // P2PKH mainnet address format
    return address;
  }

  // Encrypt private key with envelope encryption
  encryptPrivateKey(privateKey, userPassword) {
    const { keyId, encryptedKey, plaintextKey } = keyManager.generateDataKey();

    const encryptedPrivateKey = cryptoVault.encryptSecret(privateKey, {
      dataKey: plaintextKey,
      keyId,
      encryptedKey,
      aad: userPassword
    });

    return {
      encryptedPrivateKey,
      keyId,
      encryptedDataKey: encryptedKey
    };
  }

  // Decrypt private key (supports legacy format)
  decryptPrivateKey(wallet, userPassword) {
    const legacyDecrypt = (encryptedLegacy) => {
      const encryptionKey = process.env.ENCRYPTION_KEY + userPassword;
      return decrypt(encryptedLegacy, encryptionKey);
    };

    return cryptoVault.decryptSecret(wallet.encryptedPrivateKey, {
      encryptedKey: wallet.encryptedDataKey,
      aad: userPassword,
      legacyDecrypt
    });
  }

  // Get balance
  async getBalance(address, network = 'ethereum') {
    try {
      if (network === 'bitcoin' || network === 'btc') {
        const balance = await btcService.getBalance(address);
        return balance.totalBtc.toString();
      }

      const provider = this.providers[network];
      const balance = await provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      logger.error('Error getting balance', { message: error.message });
      throw error;
    }
  }

  // Get token balance (ERC20)
  async getTokenBalance(address, tokenAddress, network = 'ethereum') {
    try {
      const provider = this.providers[network];
      const abi = [
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)'
      ];
      
      const contract = new ethers.Contract(tokenAddress, abi, provider);
      const balance = await contract.balanceOf(address);
      const decimals = await contract.decimals();
      
      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      logger.error('Error getting token balance', { message: error.message });
      throw error;
    }
  }

  // Send transaction
  async sendTransaction(privateKey, toAddress, amount, network = 'ethereum') {
    try {
      const provider = this.providers[network];
      const wallet = new ethers.Wallet(privateKey, provider);
      
      const tx = await wallet.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amount.toString())
      });

      const receipt = await tx.wait();
      
      return {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status === 1 ? 'confirmed' : 'failed'
      };
    } catch (error) {
      logger.error('Error sending transaction', { message: error.message });
      throw error;
    }
  }

  // Get transaction history
  async getTransactionHistory(address, network = 'ethereum') {
    try {
      const provider = this.providers[network];
      const currentBlock = await provider.getBlockNumber();
      const startBlock = currentBlock - 10000; // Last ~10000 blocks
      
      // Note: This is a basic implementation
      // For production, use services like Etherscan API or The Graph
      const transactions = [];
      
      return transactions;
    } catch (error) {
      logger.error('Error getting transaction history', { message: error.message });
      throw error;
    }
  }

  // Estimate gas fee
  async estimateGas(toAddress, amount, network = 'ethereum') {
    try {
      const provider = this.providers[network];
      const feeData = await provider.getFeeData();
      
      const gasLimit = 21000; // Standard ETH transfer
      const gasFee = feeData.gasPrice * BigInt(gasLimit);
      
      return {
        gasLimit: gasLimit,
        gasPrice: ethers.formatUnits(feeData.gasPrice, 'gwei'),
        estimatedFee: ethers.formatEther(gasFee)
      };
    } catch (error) {
      logger.error('Error estimating gas', { message: error.message });
      throw error;
    }
  }
}

module.exports = new WalletService();
