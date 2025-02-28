import {
  type Account,
  type Address,
  type Chain,
  createPublicClient,
  createWalletClient,
  custom,
  type CustomTransport,
  type Hex,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
} from 'viem';
import type { Wallet, WalletAccount } from '@mysten/wallet-standard';
import type { SuiClient } from '@mysten/sui/client';
import { IconService, HttpProvider, Wallet as IconWallet } from 'icon-sdk-js';
import type { AddressOrPrivateKeyInit, ChainName, ChainType, HttpPrefixedUrl, IconEoaAddress } from '../types.js';
import { getEvmViemChain } from '../constants.js';
import {
  isEvmInitializedConfig,
  isEvmUninitializedConfig,
  isIconInitializedConfig,
  isIconUninitializedConfig,
  isPrivateKeyInit,
} from '../guards.js';
import { IconWalletProvider } from '../libs/IconWalletProvider.js';

export type CustomProvider = {
  request: (...args: unknown[]) => Promise<unknown>;
};

export type EvmUninitializedBrowserConfig = {
  userAddress: Address;
  chain: ChainName;
  provider: CustomProvider;
};

export type EvmUninitializedPrivateKeyConfig = {
  chain: ChainName;
  privateKey: Hex | undefined;
  provider: string; // rpc url
};

export type EvmUninitializedConfig = EvmUninitializedBrowserConfig | EvmUninitializedPrivateKeyConfig;

export type EvmInitializedConfig = {
  walletClient?: WalletClient<CustomTransport | HttpTransport, Chain, Account>;
  publicClient: PublicClient<CustomTransport | HttpTransport>;
};

export class EvmProvider {
  private readonly _walletClient?: WalletClient<CustomTransport | HttpTransport, Chain, Account>;
  public readonly publicClient: PublicClient<CustomTransport | HttpTransport>;

  constructor(payload: EvmUninitializedBrowserConfig | EvmInitializedConfig) {
    if (isEvmUninitializedConfig(payload)) {
      this._walletClient = createWalletClient({
        account: payload.userAddress,
        transport: custom(payload.provider),
        chain: getEvmViemChain(payload.chain),
      });
      this.publicClient = createPublicClient({
        transport: custom(payload.provider),
        chain: getEvmViemChain(payload.chain),
      });
    } else if (isEvmInitializedConfig(payload)) {
      if (payload.walletClient) {
        this._walletClient = payload.walletClient;
      }
      this.publicClient = payload.publicClient;
    } else {
      throw new Error('Invalid configuration payload passed to EvmProvider');
    }
  }

  get walletClient(): WalletClient<CustomTransport | HttpTransport, Chain, Account> {
    if (!this._walletClient) {
      throw new Error('Wallet client not initialized');
    }

    return this._walletClient;
  }
}

export type SuiInitializedConfig = {
  wallet?: Wallet;
  account?: WalletAccount;
  client: SuiClient;
};

export class SuiProvider {
  private readonly _wallet?: Wallet;
  private readonly _account?: WalletAccount;
  public readonly client: SuiClient;

  constructor(payload: SuiInitializedConfig) {
    this._wallet = payload.wallet;
    this._account = payload.account;
    this.client = payload.client;
  }

  get wallet(): Wallet {
    if (!this._wallet) {
      throw new Error('[SuiProvider] Wallet not initialized');
    }
    return this._wallet;
  }
  get account(): WalletAccount {
    if (!this._account) {
      throw new Error('[SuiProvider]Account not initialized');
    }
    return this._account;
  }
}

export type IconUninitializedConfig = {
  iconRpcUrl: HttpPrefixedUrl;
  iconDebugRpcUrl: HttpPrefixedUrl;
  wallet?: AddressOrPrivateKeyInit<string, IconEoaAddress>;
};

export type IconInitializedConfig = {
  iconService: IconService; // provide IconService instance or provider url
  iconDebugRpcUrl: HttpPrefixedUrl;
  http: HttpProvider;
  wallet?: IconWallet | IconEoaAddress;
};

export class IconProvider {
  public readonly wallet: IconWalletProvider;

  constructor(payload: IconInitializedConfig | IconUninitializedConfig) {
    if (isIconUninitializedConfig(payload)) {
      this.wallet = new IconWalletProvider(
        payload.wallet
          ? isPrivateKeyInit(payload.wallet)
            ? IconWallet.loadPrivateKey(payload.wallet.privateKey)
            : payload.wallet.address
          : undefined,
        new IconService(new HttpProvider(payload.iconRpcUrl)),
        payload.iconDebugRpcUrl,
      );
    } else if (isIconInitializedConfig(payload)) {
      this.wallet = new IconWalletProvider(payload.wallet, payload.iconService, payload.iconDebugRpcUrl);
    } else {
      throw new Error('Invalid configuration payload passed to IconProvider');
    }
  }
}

export type ChainProviderType = EvmProvider | SuiProvider | IconProvider;

export type ChainProvider<T extends ChainType | undefined = undefined> = T extends 'evm'
  ? EvmProvider
  : T extends 'sui'
    ? SuiProvider
    : T extends 'icon'
      ? IconProvider
      : never;

export type GetChainProviderType<T extends ChainName> = T extends 'arb' | 'pol'
  ? ChainProvider<'evm'>
  : T extends 'sui'
    ? ChainProvider<'sui'>
    : T extends 'icon'
      ? ChainProvider<'icon'>
      : never;

export type NonEmptyChainProviders = [ChainProvider, ...ChainProvider[]];
