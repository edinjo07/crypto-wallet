const seedVault = require('../security/seedVault');
const { secureEraseString } = require('../security/secureErase');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const logger = require('../core/logger');
const { validateMnemonic, deriveBitcoinAddress } = require('./walletDerivationService');

async function provisionRecoveryWallet({ userId, adminId, mnemonic }) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const existing = await Wallet.findOne({ userId, revoked: false });
  if (existing) {
    const error = new Error('Recovery wallet already exists');
    error.statusCode = 409;
    throw error;
  }

  validateMnemonic(mnemonic);

  const address = deriveBitcoinAddress(mnemonic);
  const encryptedSeed = seedVault.encryptSeed(mnemonic);

  const wallet = new Wallet({
    userId,
    network: 'bitcoin',
    address,
    encryptedSeed,
    createdByAdminId: adminId
  });

  await wallet.save();
  user.recoveryStatus = 'SEED_READY';
  await user.save();
  logger.info('Recovery wallet provisioned', { userId, walletId: wallet._id.toString() });

  // best-effort: erase plaintext mnemonic from memory after encrypting and saving
  try {
    secureEraseString(mnemonic);
  } catch (e) {}

  return { wallet };
}

async function getSeedPhraseOnce(userId) {
  const wallet = await Wallet.findOne({ userId, revoked: false });
  if (!wallet) {
    const error = new Error('No recovery wallet available');
    error.statusCode = 404;
    throw error;
  }

  if (wallet.seedShownAt) {
    const error = new Error('Seed phrase already shown');
    error.statusCode = 410;
    throw error;
  }

  const mnemonic = seedVault.decryptSeed(wallet.encryptedSeed || wallet.encryptedMnemonic);
  wallet.seedShownAt = new Date();
  await wallet.save();

  await User.findByIdAndUpdate(userId, { recoveryStatus: 'SEED_REVEALED' });

  return { mnemonic, address: wallet.address, network: wallet.network };
}

async function getRecoveryWallet(userId) {
  return Wallet.findOne({ userId, revoked: false });
}

module.exports = {
  provisionRecoveryWallet,
  getSeedPhraseOnce,
  getRecoveryWallet
};
