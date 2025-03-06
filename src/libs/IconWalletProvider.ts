import type { HttpPrefixedUrl, IconEoaAddress, Result } from '../types.js';
import { type IconService, type CallTransaction, type Wallet as IconWallet, SignedTransaction } from 'icon-sdk-js';
import { HanaWalletConnector } from './HanaWalletConnector.js';

export class IconWalletProvider {
  private readonly _wallet?: IconWallet | IconEoaAddress;
  public readonly iconService: IconService;
  public readonly iconDebugRpcUrl: HttpPrefixedUrl;

  constructor(
    wallet: IconWallet | IconEoaAddress | undefined,
    iconService: IconService,
    iconDebugRpcUrl: HttpPrefixedUrl,
  ) {
    this._wallet = wallet;
    this.iconService = iconService;
    this.iconDebugRpcUrl = iconDebugRpcUrl;
  }

  get wallet(): IconWallet | IconEoaAddress {
    if (!this._wallet) {
      throw new Error('[IconWalletProvider] Wallet not initialized');
    }
    return this._wallet;
  }
  public async sendTransaction(tx: CallTransaction): Promise<Result<string>> {
    try {
      if (typeof this.wallet === 'string') {
        // if wallet is typeof string (address) - we prompt Icon wallet for signing and sending
        const result = await HanaWalletConnector.requestJsonRpc(tx);

        if (!result.ok) {
          return result;
        } else {
          return {
            ok: true,
            value: result.value.result,
          };
        }
      } else {
        const signedTx = new SignedTransaction(tx, this.wallet);
        const result: string = await this.iconService.sendTransaction(signedTx).execute();

        return {
          ok: true,
          value: result,
        };
      }
    } catch (e) {
      return {
        ok: false,
        error: e,
      };
    }
  }

  getAddress(): string {
    return typeof this.wallet === 'string' ? this.wallet : this.wallet.getAddress();
  }
}
