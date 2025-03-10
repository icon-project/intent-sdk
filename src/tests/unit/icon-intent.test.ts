import { describe, it, expect } from 'vitest';
import type { CallTransaction } from 'icon-sdk-js';
import type { CreateIntentOrderPayload, IconChainConfig, SuiChainConfig } from '../../types.js';
import { IconIntentService } from '../../services/IconIntentService.js';
import { chainConfig } from '../../index.js';

describe('IconIntentService', () => {
  describe('constructIntentOrderTx', () => {
    const iconChainConfig = chainConfig['icon'] as IconChainConfig;
    const suiChainConfig = chainConfig['sui'] as SuiChainConfig;

    const exampleTransaction = {
      to: 'cx2609b924e33ef00b648a409245c7ea394c467824',
      from: 'hxcd2fd5861d7d3826b80d8dfe60c627c90e2ce301',
      stepLimit: '0x1312d00',
      nid: '0x1',
      version: '0x3',
      method: 'transfer',
      value: '0x0',
      signature: '0x0',
      timestamp: 1661234567890,
      nonce: '0x1',
      dataType: 'call',
      params: {
        _to: 'cx55f6ac86d82a14022c338c8c0033eeceeeab382d',
        _value: '0x1d8980808950d6d4',
        _data:
          '0xf90142b90139f9013600aa637835356636616338366438326131343032326333333863386330303333656563656565616233383264883078312e69636f6e8c307838392e706f6c79676f6eaa687863643266643538363164376433383236623830643864666536306336323763393065326365333031aa307837354636443031383331394464354463324362316333663246413441643136313736356139623541aa637832363039623932346533336566303062363438613430393234356337656133393463343637383234881d8980808950d700aa307830303030303030303030303030303030303030303030303030303030303030303030303030303030880de0b6b3a7640000b57b2271756f74655f75756964223a2237656338636632352d306634352d346361382d613863652d353263653130616234636337227d847377617080',
      },
      data: {
        method: 'transfer',
        params: {
          _to: 'cx55f6ac86d82a14022c338c8c0033eeceeeab382d',
          _value: '0x1d8980808950d6d4',
          _data:
            '0xf90142b90139f9013600aa637835356636616338366438326131343032326333333863386330303333656563656565616233383264883078312e69636f6e8c307838392e706f6c79676f6eaa687863643266643538363164376433383236623830643864666536306336323763393065326365333031aa307837354636443031383331394464354463324362316333663246413441643136313736356139623541aa637832363039623932346533336566303062363438613430393234356337656133393463343637383234881d8980808950d700aa307830303030303030303030303030303030303030303030303030303030303030303030303030303030880de0b6b3a7640000b57b2271756f74655f75756964223a2237656338636632352d306634352d346361382d613863652d353263653130616234636337227d847377617080',
        },
      },
    } satisfies CallTransaction;

    const amount = 1000000000000000001n;
    const amountHex = '0xde0b6b3a7640001';
    const basePayload: CreateIntentOrderPayload = {
      fromAddress: 'hx1234567890123456789012345678901234567890',
      toAddress: 'hx0987654321098765432109876543210987654321',
      fromChain: 'icon',
      toChain: 'sui',
      token: iconChainConfig.nativeToken,
      amount: amount, // 1 ICX
      toToken: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
      toAmount: amount,
      quote_uuid: 'test-quote-uuid',
    };

    it('Should convert bigint to proper _value hex 1', () => {
      const value = 2128373588457215744n;
      const valueHex = '0x1d8980808950d700';

      const tx = IconIntentService.constructIntentOrderTx(
        {
          ...basePayload,
          amount: value,
        },
        iconChainConfig,
        suiChainConfig,
      );
      expect(tx.value?.toString()).toBe(valueHex);
    });

    it('Should convert bigint to proper _value hex 2', () => {
      const orderAmount = 3786633557917726208n;
      const orderAmountHex = '0x348cd32892427600';

      const tx = IconIntentService.constructIntentOrderTx(
        {
          ...basePayload,
          amount: orderAmount,
        },
        iconChainConfig,
        suiChainConfig,
      );
      expect(tx.value?.toString()).toBe(orderAmountHex);
    });

    it('should construct transaction for native token (ICX)', () => {
      const tx = IconIntentService.constructIntentOrderTx(basePayload, iconChainConfig, suiChainConfig);

      expect(tx).toBeDefined();
      expect(tx.to).toBe(iconChainConfig.nativeToken);
      expect(tx.value?.toString()).toBe(amountHex);
    });

    it('should construct transaction for non-native token', () => {
      const nonNativePayload = {
        ...basePayload,
        token: 'cxabcdef1234567890abcdef1234567890abcdef12', // Some token contract
      };

      const tx = IconIntentService.constructIntentOrderTx(nonNativePayload, iconChainConfig, suiChainConfig);

      expect(tx).toBeDefined();
      expect(tx.to).toBe(nonNativePayload.token);
      expect(tx.value).toBeUndefined();
    });

    it('should handle very small amounts', () => {
      const smallAmountPayload = {
        ...basePayload,
        amount: 1n, // Smallest possible amount
        toAmount: 1n,
      };

      const tx = IconIntentService.constructIntentOrderTx(smallAmountPayload, iconChainConfig, suiChainConfig);

      expect(tx).toBeDefined();
      expect(tx.value?.toString()).toBe('0x1');
    });

    it('should handle very large amounts', () => {
      const largeAmount = 11579208923731619542357098500868790785326998466564056403945758400791n; // Max uint256
      const largeAmountHex = '0x6df37f675ef6eadf5ab9a2072d44268d97df837e6748956e5c6c2117';
      const largeAmountPayload = {
        ...basePayload,
        amount: largeAmount,
        toAmount: largeAmount,
      };

      const tx = IconIntentService.constructIntentOrderTx(largeAmountPayload, iconChainConfig, suiChainConfig);

      expect(tx).toBeDefined();
      expect(tx.value?.toString()).toBe(largeAmountHex);
    });
  });
});
