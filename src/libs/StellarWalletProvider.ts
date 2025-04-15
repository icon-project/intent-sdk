import type {AddressOrPrivateKeyInit, Result} from '../types.js';
import { isPrivateKeyInit } from '../guards.js';
import * as StellarSdk from '@stellar/stellar-sdk';

export type StellarAddress = string;

export type StellarWallet = {
    getAddress(): StellarAddress;
    signTransaction(transaction: StellarSdk.Transaction): Promise<StellarSdk.Transaction>;
    sendTransaction(transaction: StellarSdk.Transaction): Promise<Result<string>>;
};

export type StellarProviderType = {
    signTransaction(transaction: StellarSdk.Transaction): Promise<Result<string>>;
}

export type StellarWalletType = {
    address: string;
    privateKey?: string;
}


export class StellarWalletProvider implements StellarWallet {
    private readonly _address?: StellarAddress;
    private readonly _keypair?: StellarSdk.Keypair;
    private readonly _wallet?: StellarWalletType;
    private readonly _provider?: StellarProviderType;
    public readonly server: StellarSdk.rpc.Server;
    public readonly networkPassphrase: string;

    constructor(
        wallet: StellarWalletType | undefined,
        server: StellarSdk.rpc.Server,
        networkPassphrase: string,
        provider?: StellarProviderType,
    ) {
        console.log({wallet, provider}, '<<<<<<<<STELLAR WALLET CONSTRUCTOR>>>>>>>>')
        if (wallet) {
            this._wallet = wallet;
            if (isPrivateKeyInit(wallet)) {
                this._keypair = StellarSdk.Keypair.fromSecret(wallet.privateKey);
                this._address = this._keypair.publicKey();
            } else {
                this._address = wallet.address;
            }
        }
        this.server = server;
        this.networkPassphrase = networkPassphrase;
        this._provider = provider;
    }

    getAddress(): StellarAddress {
        if (!this._address) {
            throw new Error('[StellarWalletProvider] Address not initialized');
        }
        return this._address;
    }

    async signTransaction(transaction: StellarSdk.Transaction): Promise<StellarSdk.Transaction> {
        if (!this._keypair) {
            throw new Error('[StellarWalletProvider] Cannot sign transaction: no keypair available');
        }

        transaction.sign(this._keypair);
        return transaction;
    }
    get wallet(): StellarWalletType {
        if (!this._wallet) {
            throw new Error('[Stellar] Wallet not initialized');
        }
        return this._wallet;
    }
    async sendTransaction(transaction: StellarSdk.Transaction): Promise<Result<string>> {
        console.log({wallet: this.wallet, provider: this._provider, keyPair: this._keypair});
        console.log({xdr: transaction,accountToSign: this.wallet.address, networkPassphrase: "Public Global Stellar Network ; September 2015"});
        // if(!this.wallet.privateKey && this._provider){
        //     const result = await this._provider.signTransaction(transaction);
        //     console.log({result})
        //     return result;
        // }
        try {
            if (this._keypair) {
                console.log("before sign");
                transaction.sign(this._keypair);
                console.log("after sign");
            } else if (!transaction.signatures || transaction.signatures.length === 0) {
                return {
                    ok: false,
                    error: new Error('[StellarWalletProvider] Transaction not signed and no keypair available'),
                };
            }

            console.log({transaction}, 'SIGNED TX BEFORE SENDING@@@@@@@@@@@@@@@');
            const response = await this.server.sendTransaction(transaction);
            console.log({response}, 'RESPONSE FROM SERVER@@@@@@@@@@@@@@@');

            if(response?.status === "ERROR"){
                throw new Error(response.status);
            }
            if(response?.status === "PENDING"){
                throw new Error(response.status);
            }
            return {
                ok: true,
                value: response.hash,
            };
        } catch (e) {
            return {
                ok: false,
                error: e,
            };
        }
    }
}