import { describe, it, expect } from 'vitest';
import { IntentService } from '../../services/index.js';
import type { IntentQuoteResponse } from '../../index.js';

describe('e2e', () => {
  it('Test Arbitrum ETH to Polygon POL quote', async () => {
    const intentService = new IntentService({
      solverApiEndpoint: 'https://staging-solver.iconblockchain.xyz',
    });

    const ETH = {
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      address: '0x0000000000000000000000000000000000000000',
      blockchain_id: '0xa4b1.arbitrum',
    };

    const POL = {
      symbol: 'POL',
      name: 'Polygon',
      decimals: 18,
      address: '0x0000000000000000000000000000000000000000',
      blockchain_id: '0x89.polygon',
    };

    const amount = BigInt(1 * 10 ** ETH.decimals);

    const quoteResult = await intentService.getQuote({
      token_src: ETH.address, // WETH
      token_src_blockchain_id: ETH.blockchain_id,
      token_dst: POL.address, // native SUI
      token_dst_blockchain_id: POL.blockchain_id,
      amount: amount,
      quote_type: 'exact_input',
    });

    expect(quoteResult.ok).toBe(true);

    if (quoteResult.ok) {
      const value: IntentQuoteResponse = quoteResult.value;
      expect(value.quoted_amount).toBeGreaterThan(0n);
      expect(value.uuid).toBeDefined();
    } else {
      throw new Error('Failed to get quote');
    }

    console.log(quoteResult);

    expect(true).toBe(true);
  });

  it('Test Icon bnUSD to Polygon POL quote', async () => {
    const intentService = new IntentService({
      solverApiEndpoint: 'https://staging-solver.iconblockchain.xyz',
    });

    const bnUSD = {
      symbol: 'bnUSD',
      name: 'Balanced Network USD',
      decimals: 18,
      address: 'cx88fd7df7ddff82f7cc735c871dc519838cb235bb',
      blockchain_id: '0x1.icon',
    };

    const POL = {
      symbol: 'POL',
      name: 'Polygon',
      decimals: 18,
      address: '0x0000000000000000000000000000000000000000',
      blockchain_id: '0x89.polygon',
    };

    const amount = BigInt(1 * 10 ** bnUSD.decimals);

    const quoteResult = await intentService.getQuote({
      token_src: bnUSD.address, // WETH
      token_src_blockchain_id: bnUSD.blockchain_id,
      token_dst: POL.address, // native SUI
      token_dst_blockchain_id: POL.blockchain_id,
      amount: amount,
      quote_type: 'exact_input',
    });

    expect(quoteResult.ok).toBe(true);

    if (quoteResult.ok) {
      const value: IntentQuoteResponse = quoteResult.value;
      expect(value.quoted_amount).toBeGreaterThan(0n);
      expect(value.uuid).toBeDefined();
    } else {
      throw new Error('Failed to get quote');
    }

    console.log(quoteResult);

    expect(true).toBe(true);
  });
});
