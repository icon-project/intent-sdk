import type { Result } from '../types.js';
import { HanaWalletConnector } from './HanaWalletConnector.js';
import { Keypair, Transaction, type VersionedTransaction } from '@solana/web3.js';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes/index.js';
import type { Wallet } from '@coral-xyz/anchor/dist/cjs/provider.js';

export class SolanaWalletProvider {
    private readonly _wallet: Wallet;
    public readonly keypair: Keypair;
    constructor(
        privateKey: string,
    ) {
        this.keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
        this._wallet = {
            publicKey: this.keypair.publicKey,
            signTransaction: async<T extends Transaction | VersionedTransaction>(tx: T) => {
                if (tx instanceof Transaction) {
                    tx.partialSign(this.keypair);
                } else {
                    tx.sign([this.keypair]);
                }
                return tx;
            },
            signAllTransactions: async<T extends Transaction | VersionedTransaction>(txs: T[]) => {
                return txs.map((tx) => {
                    if (tx instanceof Transaction) {
                        tx.partialSign(this.keypair);
                    } else {
                        tx.sign([this.keypair]);
                    }
                    return tx;
                });
            }
        }
    }

    get wallet(): Wallet {
        if (!this._wallet) {
            throw new Error('[SolanaWalletProvider] Wallet not initialized');
        }
        return this._wallet;
    }
    getAddress(): string {
        return typeof this._wallet === 'string' ? this._wallet : this._wallet.publicKey.toString();
    }
}
