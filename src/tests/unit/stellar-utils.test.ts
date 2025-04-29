import { describe, it, expect, vi } from 'vitest';
import { bigintToUInt128Parts, extractScVal } from '../../utils/stellar-utils.js';

interface ScValBase {
    switch(): { name: string };
}

interface ScValU128 extends ScValBase {
    u128(): {
        hi(): { toString(): string };
        lo(): { toString(): string };
    };
}

interface ScValI128 extends ScValBase {
    i128(): {
        hi(): { toString(): string };
        lo(): { toString(): string };
    };
}

interface ScValString extends ScValBase {
    str(): { toString(): string };
}

interface ScValSymbol extends ScValBase {
    sym(): { toString(): string };
}

interface ScValBytes extends ScValBase {
    bytes(): Uint8Array;
}

type ScVal = ScValBase | ScValU128 | ScValI128 | ScValString | ScValSymbol | ScValBytes;

describe('stellar-utils', () => {
    describe('bigintToUInt128Parts', () => {
        it('should handle values less than 2^64', () => {
            const smallValues = [
                0n,
                1n,
                100n,
                0xFFFFn,
                0xFFFFFFFFn,
                0xFFFFFFFFFFFFFFFFn - 1n
            ];

            smallValues.forEach(value => {
                const result = bigintToUInt128Parts(value);
                expect(result.lo().toString()).toBe(value.toString());
                expect(result.hi().toString()).toBe('0');
            });
        });

        it('should handle large values that require both hi and lo parts', () => {
            const testCases = [
                {
                    input: BigInt('0x10000000000000000'), // 2^64
                    expectedHi: '1',
                    expectedLo: '0'
                },
                {
                    input: BigInt('0x10000000000000001'), // 2^64 + 1
                    expectedHi: '1',
                    expectedLo: '1'
                },
                {
                    input: BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'), // Max uint128
                    expectedHi: '18446744073709551615', // 2^64 - 1
                    expectedLo: '18446744073709551615'  // 2^64 - 1
                },
                {
                    input: BigInt('123456789012345678901234567890'), // Large number
                    expectedHi: '6692605942', // Upper 64 bits
                    expectedLo: '14083847773837265618' // Lower 64 bits
                }
            ];

            testCases.forEach(({ input, expectedHi, expectedLo }) => {
                const result = bigintToUInt128Parts(input);
                expect(result.hi().toString()).toBe(expectedHi);
                expect(result.lo().toString()).toBe(expectedLo);

                const reconstructed = (BigInt(result.hi().toString()) << 64n) + BigInt(result.lo().toString());
                expect(reconstructed).toBe(input);
            });
        });
    });

    describe('extractScVal', () => {
        // Helper function to create mock ScVal objects with proper typing
        function createMockScVal(type: string, value: unknown): ScVal {
            switch (type) {
                case 'scvU128': {
                    const typedValue = value as { hi: string; lo: string };
                    const mockScVal: ScValU128 = {
                        switch: () => ({ name: 'scvU128' }),
                        u128: () => ({
                            hi: () => ({ toString: () => typedValue.hi }),
                            lo: () => ({ toString: () => typedValue.lo })
                        })
                    };
                    return mockScVal;
                }
                case 'scvI128': {
                    const typedValue = value as { hi: string; lo: string };
                    const mockScVal: ScValI128 = {
                        switch: () => ({ name: 'scvI128' }),
                        i128: () => ({
                            hi: () => ({ toString: () => typedValue.hi }),
                            lo: () => ({ toString: () => typedValue.lo })
                        })
                    };
                    return mockScVal;
                }
                case 'scvString': {
                    const typedValue = value as string;
                    const mockScVal: ScValString = {
                        switch: () => ({ name: 'scvString' }),
                        str: () => ({ toString: () => typedValue })
                    };
                    return mockScVal;
                }
                case 'scvSymbol': {
                    const typedValue = value as string;
                    const mockScVal: ScValSymbol = {
                        switch: () => ({ name: 'scvSymbol' }),
                        sym: () => ({ toString: () => typedValue })
                    };
                    return mockScVal;
                }
                case 'scvBytes': {
                    const typedValue = value as Uint8Array;
                    const mockScVal: ScValBytes = {
                        switch: () => ({ name: 'scvBytes' }),
                        bytes: () => typedValue
                    };
                    return mockScVal;
                }
                default: {
                    const mockScVal: ScValBase = {
                        switch: () => ({ name: type })
                    };
                    return mockScVal;
                }
            }
        }

        it('should handle U128 values', () => {
            const testCases = [
                {
                    hi: '0',
                    lo: '123',
                    expected: 123n
                },
                {
                    hi: '1',
                    lo: '0',
                    expected: 18446744073709551616n // 2^64
                },
                {
                    hi: '1',
                    lo: '1',
                    expected: 18446744073709551617n // 2^64 + 1
                }
            ];

            testCases.forEach(({ hi, lo, expected }) => {
                const mockScVal = createMockScVal('scvU128', { hi, lo });
                const result = extractScVal(mockScVal as unknown as InstanceType<typeof import('@stellar/stellar-sdk').xdr.ScVal>);
                expect(result).toBe(expected);
            });
        });

        it('should handle I128 values', () => {
            const testCases = [
                {
                    hi: '0',
                    lo: '456',
                    expected: 456n
                },
                {
                    hi: '1',
                    lo: '0',
                    expected: 18446744073709551616n // 2^64
                }
            ];

            testCases.forEach(({ hi, lo, expected }) => {
                const mockScVal = createMockScVal('scvI128', { hi, lo });
                const result = extractScVal(mockScVal as unknown as InstanceType<typeof import('@stellar/stellar-sdk').xdr.ScVal>);
                expect(result).toBe(expected);
            });
        });

        it('should handle string values', () => {
            const testString = 'Hello, Stellar!';
            const mockScVal = createMockScVal('scvString', testString);
            const result = extractScVal(mockScVal as unknown as InstanceType<typeof import('@stellar/stellar-sdk').xdr.ScVal>);
            expect(result).toBe(testString);
        });

        it('should handle symbol values', () => {
            const testSymbol = 'TEST_SYMBOL';
            const mockScVal = createMockScVal('scvSymbol', testSymbol);
            const result = extractScVal(mockScVal as unknown as InstanceType<typeof import('@stellar/stellar-sdk').xdr.ScVal>);
            expect(result).toBe(testSymbol);
        });

        it('should handle byte values', () => {
            const testBytes = Buffer.from([1, 2, 3, 4]);
            const mockScVal = createMockScVal('scvBytes', testBytes);
            const result = extractScVal(mockScVal as unknown as InstanceType<typeof import('@stellar/stellar-sdk').xdr.ScVal>);
            expect(result).toEqual(testBytes);
        });

        it('should handle unknown types', () => {
            const mockScVal = createMockScVal('scvUnknownType', null);
            const result = extractScVal(mockScVal as unknown as InstanceType<typeof import('@stellar/stellar-sdk').xdr.ScVal>);
            expect(result).toBe('[scvUnknownType]');
        });

        it('should handle null input', () => {
            const result = extractScVal(null as unknown as InstanceType<typeof import('@stellar/stellar-sdk').xdr.ScVal>);
            expect(result).toBe('');
        });

        it('should handle errors during extraction', () => {
            const mockErrorScVal: ScValU128 = {
                switch: () => ({ name: 'scvU128' }),
                u128: () => { throw new Error('Test error'); }
            };

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const result = extractScVal(mockErrorScVal as unknown as InstanceType<typeof import('@stellar/stellar-sdk').xdr.ScVal>);
            expect(result).toBe('U128_ERROR');
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });
});