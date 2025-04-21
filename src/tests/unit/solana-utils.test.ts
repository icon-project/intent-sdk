import { describe, it, expect } from 'vitest';
import { parseSolanaSwapOrder } from '../../utils/solana-utils.js';

describe('solana-utils', () => {
    describe('parseSwapOrderLogs', () => {

        it('should correctly parse solana swap logs', () => {
            const logs = "Program data: IBQaWgGOAA0yAAAAAAAAAAAAAAAAAAAALAAAADdiYTJKaGRpNkFmVkMxQnFXY3R6WkdMUzN3ZnplY3dUek1jZDVqZXl6TmpxBgAAAHNvbGFuYQgAAAAweDEuaWNvbisAAAB1QjRYRnpNS01VUkRxOVppUGRyMlJRTFBoZ3BNS0NzWlg4VThuVmJwdW1wKwAAAHVCNFhGek1LTVVSRHE5WmlQZHIyUlFMUGhncE1LQ3NaWDhVOG5WYnB1bXAgAAAAMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTFAQg8AAAAAAAAAAAAAAAAAKgAAAGN4Mzk3NWI0M2QyNjBmYjhlYzgwMmNlZjZlNjBjMmY0ZDA3NDg2ZjExZKjHxQYAAAAAAAAAAAAAAAAgAAAAeyJxdW90ZV91dWlkIjoidGVzdC1xdW90ZS11dWlkIn0="
            const swapOrderResult = parseSolanaSwapOrder([logs])
            expect(swapOrderResult.ok).toBe(true)
            if (swapOrderResult.ok) {
                const swapOrder = swapOrderResult.value
                expect(swapOrder.srcNID).equals("solana")
                expect(swapOrder.dstNID).equals("0x1.icon")
                const expectdID = "50"
                expect(swapOrder.id.toString()).equals(expectdID)
            }

        });
    });
});
