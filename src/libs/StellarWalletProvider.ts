import type { Result } from "../types.js";
import { isPrivateKeyInit } from "../guards.js";
import * as StellarSdk from "@stellar/stellar-sdk";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import { isPrivateKeyWallet, isProviderWallet, isTransactionContainSignature } from "../utils/index.js";

export type StellarAddress = string;

export type StellarWallet = {
  getAddress(): StellarAddress;
  signTransaction(
    transaction: StellarSdk.Transaction,
  ): Promise<StellarSdk.Transaction>;
  sendTransaction(transaction: StellarSdk.Transaction): Promise<Result<string>>;
};

export type StellarProviderType = {
  signTransaction(transaction: { xdr: string; accountToSign: string; networkPassphrase: string; }): Promise<string>;
};

export type StellarWalletType = {
  address: string;
  privateKey?: string;
};

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
      throw new Error("[StellarWalletProvider] Address not initialized");
    }
    return this._address;
  }

  async signTransaction(
    transaction: StellarSdk.Transaction,
  ): Promise<StellarSdk.Transaction> {
    if (!this._keypair) {
      throw new Error(
        "[StellarWalletProvider] Cannot sign transaction: no keypair available",
      );
    }

    transaction.sign(this._keypair);
    return transaction;
  }
  get wallet(): StellarWalletType {
    if (!this._wallet) {
      throw new Error("[Stellar] Wallet not initialized");
    }
    return this._wallet;
  }

  async sendTransaction(
    transaction: StellarSdk.Transaction,
  ): Promise<Result<string>> {
    if (isProviderWallet(this.wallet.privateKey, this._provider)) {
      const signedXdr = await this._provider!.signTransaction({
        xdr: transaction.toXDR(),
        accountToSign: this.wallet.address,
        networkPassphrase: this.networkPassphrase,
      });
      const signedTransaction = TransactionBuilder.fromXDR(
        signedXdr,
        this.networkPassphrase,
      );
      const response = await this.server.sendTransaction(signedTransaction);

      if (response?.status === "ERROR") {
        throw new Error(response.status);
      }

      return {
        ok: true,
        value: response.hash,
      };

    } else if(isPrivateKeyWallet(this._keypair)){
      transaction.sign(this._keypair);
    } else {
      throw new Error("[StellarWalletProvider] Wallet not initialized");
    }

    try {
      if (isTransactionContainSignature(transaction))
      {
        return {
          ok: false,
          error: new Error(
            "[StellarWalletProvider] Transaction is not signed",
          ),
        };
      }

      const response = await this.server.sendTransaction(transaction);

      if (response?.status === "ERROR") {
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