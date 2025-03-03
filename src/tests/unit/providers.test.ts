import { describe, it, expect } from 'vitest';
import {
  EvmProvider,
  IconProvider,
  SuiProvider,
  type EvmUninitializedBrowserConfig,
  type IconUninitializedConfig,
} from '../../entities/index.js';
import { IconService, HttpProvider } from 'icon-sdk-js';
import type { SuiClient } from '@mysten/sui/client';
import type { Wallet, WalletAccount } from '@mysten/wallet-standard';

describe('Providers', () => {
  describe('EvmProvider', () => {
    it('should initialize with uninitialized browser config', () => {
      const provider = new EvmProvider({
        userAddress: '0x601020c5797Cdd34f64476b9bf887a353150Cb9a',
        chain: 'arb',
        provider: { request: async () => ({}) },
      });

      expect(provider.walletClient).toBeDefined();
      expect(provider.publicClient).toBeDefined();
    });

    it('should initialize with uninitialized private key config', () => {
      const provider = new EvmProvider({
        chain: 'arb',
        privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        provider: 'https://arb1.arbitrum.io/rpc',
      });

      expect(provider.publicClient).toBeDefined();
      // walletClient should be initialized with the private key
      expect(provider.walletClient).toBeDefined();
    });

    it('should initialize with uninitialized private key config with undefined key', () => {
      const provider = new EvmProvider({
        chain: 'arb',
        privateKey: undefined,
        provider: 'https://arb1.arbitrum.io/rpc',
      });

      expect(provider.publicClient).toBeDefined();
      // Should throw when accessing walletClient since privateKey is undefined
      expect(() => provider.walletClient).toThrow('Wallet client not initialized');
    });

    it('should throw error on invalid config', () => {
      expect(() => new EvmProvider({} as EvmUninitializedBrowserConfig)).toThrow('Invalid configuration');
    });
  });

  describe('IconProvider', () => {
    it('should initialize with uninitialized config using address', () => {
      const provider = new IconProvider({
        iconRpcUrl: 'https://ctz.solidwallet.io/api/v3',
        iconDebugRpcUrl: 'https://ctz.solidwallet.io/api/v3d',
        wallet: {
          address: 'hx601020c5797Cdd34f64476b9bf887a353150Cb9a',
        },
      });

      expect(provider.wallet).toBeDefined();
      expect(provider.wallet.getAddress()).toBe('hx601020c5797Cdd34f64476b9bf887a353150Cb9a');
    });

    it('should initialize with uninitialized config using private key and throw error', () => {
      expect(
        () =>
          new IconProvider({
            iconRpcUrl: 'https://ctz.solidwallet.io/api/v3',
            iconDebugRpcUrl: 'https://ctz.solidwallet.io/api/v3d',
            wallet: {
              privateKey: '0x0000000000000000000000000000000000000000000000000000000000000000',
            },
          }),
      ).toThrow('not a valid private key');
    });

    it('should initialize with initialized config', () => {
      const httpProvider = new HttpProvider('https://ctz.solidwallet.io/api/v3');
      const provider = new IconProvider({
        iconService: new IconService(httpProvider),
        iconDebugRpcUrl: 'https://ctz.solidwallet.io/api/v3d',
        http: httpProvider,
        wallet: 'hx601020c5797Cdd34f64476b9bf887a353150Cb9a',
      });

      expect(provider.wallet).toBeDefined();
      expect(provider.wallet.getAddress()).toBe('hx601020c5797Cdd34f64476b9bf887a353150Cb9a');
    });

    it('should throw error on invalid config', () => {
      expect(() => new IconProvider({} as IconUninitializedConfig)).toThrow('Invalid configuration');
    });
  });

  describe('SuiProvider', () => {
    const mockWallet = { name: 'MockWallet' };
    const mockAccount = { address: '0x123' };
    const mockClient = { getObject: async () => ({}) };

    it('should initialize with valid config', () => {
      const provider = new SuiProvider({
        wallet: mockWallet as Wallet,
        account: mockAccount as WalletAccount,
        client: mockClient as unknown as SuiClient,
      });

      expect(provider.wallet).toBe(mockWallet);
      expect(provider.account).toBe(mockAccount);
      expect(provider.client).toBe(mockClient);
    });

    it('should maintain provided references', () => {
      const config = {
        wallet: mockWallet as Wallet,
        account: mockAccount as WalletAccount,
        client: mockClient as unknown as SuiClient,
      };
      const provider = new SuiProvider(config);

      expect(provider.wallet).toBe(config.wallet);
      expect(provider.account).toBe(config.account);
      expect(provider.client).toBe(config.client);
    });
  });
});
