import { stringToBytes } from 'viem';
import { SwapOrder, type StellarProvider } from '../entities/index.js';
import type {
    ChainConfig,
    CreateIntentOrderPayload,
    Result,
    StellarChainConfig
} from '../types.js';
import {
    TransactionBuilder,
    xdr,
    Address,
    nativeToScVal,
    Operation, scValToNative, Networks, Contract,
    SorobanRpc
} from '@stellar/stellar-sdk';
import {assembleTransaction, type Server} from '@stellar/stellar-sdk/rpc';

export class StellarIntentService {
    private constructor() {}

    /**
     * Call the get_nid function on the Stellar contract
     * @param contractAddress - The contract address
     * @param provider - The Stellar provider
     * @returns The network ID as a string
     */
    static async getNid(
        contractAddress: string,
        provider: StellarProvider
    ): Promise<Result<string>> {
        try {
            console.log(`Calling get_nid on contract: ${contractAddress}`);

            // Get source account
            const sourceAccount = await provider.server.getAccount(provider.wallet.getAddress());

            // Convert contract address to the appropriate format
            const contractId = Address.fromString(contractAddress).toScAddress();

            // Create the host function call - get_nid typically doesn't need parameters
            const hostFunction = xdr.HostFunction.hostFunctionTypeInvokeContract(
                new xdr.InvokeContractArgs({
                    contractAddress: contractId,
                    functionName: 'get_nid',
                    args: [] // No parameters
                })
            );

            // Build simulation transaction
            const simTx = new TransactionBuilder(sourceAccount, {
                fee: '100',
                networkPassphrase: provider.networkPassphrase,
            })
                .addOperation(
                    Operation.invokeHostFunction({
                        func: hostFunction,
                    })
                )
                .setTimeout(0)
                .build();

            // Simulate transaction
            console.log("Simulating get_nid transaction...");
            const simulation = await provider.server._simulateTransaction(simTx);

            if (simulation.error) {
                console.error("Simulation error details:", JSON.stringify(simulation, null, 2));
                throw new Error(`Simulation error: ${simulation.error}`);
            }

            if (!simulation.results || !simulation.results[0]) {
                throw new Error('Invalid simulation result');
            }

            console.log({
                simulation
            }, 'THIS IS SIMULATION>>>>>>>>>>>>>>>>>.')
            // Convert the result from ScVal to native type (should be a string)
            const xdrBuffer = Buffer.from(simulation.results[0].xdr, 'base64');
            const scVal = xdr.ScVal.fromXDR(xdrBuffer);

            // Convert the result from ScVal to native type
            const nid = scValToNative(scVal);
            console.log(`Successfully retrieved nid: ${nid}`);
            return {
                ok: true,
                value: nid as string
            };
        } catch (e) {
            console.error("Error getting nid:", e);
            return {
                ok: false,
                error: e,
            };
        }
    }

    /**
     * Create Stellar intent order
     * @param payload - Intent payload
     * @param fromChainConfig - Stellar chain config
     * @param toChainConfig - Destination chain config
     * @param provider - Stellar provider
     */
    static async createIntentOrder(
        payload: CreateIntentOrderPayload,
        fromChainConfig: StellarChainConfig,
        toChainConfig: ChainConfig,
        provider: StellarProvider,
    ): Promise<Result<string>> {
        try {
            // Create a SwapOrder struct with the required parameters
            console.log({
                payload,
                fromChainConfig,
                toChainConfig,
                provider
            }, '<<<<<<<<<<<<<<<<HERE START CREATE INTENT')
            const intent = new SwapOrder(
                0n,
                fromChainConfig.intentContract,
                fromChainConfig.nid,
                toChainConfig.nid,
                payload.fromAddress,
                payload.toAddress,
                payload.token,
                payload.amount,
                payload.toToken,
                payload.toAmount,
                stringToBytes(
                    JSON.stringify({
                        quote_uuid: payload.quote_uuid,
                    }),
                ),
            );

            console.log("Creating transaction for intent:", {
                fromAddress: payload.fromAddress,
                toAddress: payload.toAddress,
                token: payload.token,
                amount: payload.amount.toString(),
                toToken: payload.toToken,
                toAmount: payload.toAmount.toString(),
                quoteUuid: payload.quote_uuid
            });

            const transaction = await StellarIntentService.constructSwapTransaction(
                intent, fromChainConfig, provider
            );

            console.log({transaction}, '<<<<<<<<<<<<<<<<TRANSACTION');
            return provider.wallet.sendTransaction(transaction);
        } catch (e) {
            console.error("Error creating intent order:", e);
            return {
                ok: false,
                error: e,
            };
        }
    }

    private static async constructSwapTransaction(
        intent: SwapOrder,
        chainConfig: StellarChainConfig,
        provider: StellarProvider,
    ) {
        try {

            const walletAddress = provider.wallet.getAddress();
            const contractAddress = Address.fromString(chainConfig.intentContract).toScAddress();

            function bigintToUInt128Parts(value: bigint): xdr.UInt128Parts {
                const hexValue = value.toString(16).padStart(2, '0');

                if (value < BigInt('0x10000000000000000')) {
                    return new xdr.UInt128Parts({
                        lo: xdr.Uint64.fromString(value.toString()),
                        hi: xdr.Uint64.fromString('0')
                    });
                }

                const hiPart = value >> BigInt(64);
                const loPart = value & BigInt('0xffffffffffffffff');

                return new xdr.UInt128Parts({
                    lo: xdr.Uint64.fromString(loPart.toString()),
                    hi: xdr.Uint64.fromString(hiPart.toString())
                });
            }
            const swapOrderMap = [
                new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("amount"),
                    val: xdr.ScVal.scvU128(bigintToUInt128Parts(intent.amount))
                }),
                new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("creator"),
                    val: xdr.ScVal.scvString(intent.creator)
                }),
                new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("data"),
                    val: xdr.ScVal.scvBytes(Buffer.from(intent.data))
                }),
                new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("destination_address"),
                    val: xdr.ScVal.scvString(intent.destinationAddress)
                }),
                new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("dst_nid"),
                    val: xdr.ScVal.scvString(intent.dstNID)
                }),
                new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("emitter"),
                    val: xdr.ScVal.scvString(intent.emitter)
                }),
                new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("id"),
                    val: xdr.ScVal.scvU128(bigintToUInt128Parts(intent.id))
                }),
                new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("src_nid"),
                    val: xdr.ScVal.scvString(intent.srcNID)
                }),
                new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("to_amount"),
                    val: xdr.ScVal.scvU128(bigintToUInt128Parts(intent.toAmount))
                }),
                new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("to_token"),
                    val: xdr.ScVal.scvString(intent.toToken)
                }),
                new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("token"),
                    val: xdr.ScVal.scvString(intent.token)
                })
            ];

            // const xdrParams = [
            //     nativeToScVal(intent.amount, { type: 'u128' }),
            //     nativeToScVal(intent.creator, { type: 'string' }),
            //     nativeToScVal(intent.data, { type: 'bytes' }),
            //     nativeToScVal(intent.destinationAddress, { type: 'string' }),
            //     nativeToScVal(intent.dstNID, { type: 'string' }),
            //     nativeToScVal(intent.emitter, { type: 'string' }),
            //     nativeToScVal(intent.id, { type: 'u128' }),
            //     nativeToScVal(intent.srcNID, { type: 'string' }),
            //     nativeToScVal(intent.toAmount, { type: 'u128' }),
            //     nativeToScVal(intent.toToken, { type: 'string' }),
            //     nativeToScVal(intent.token, { type: 'string' }),
            // ]

            const hostFunction = xdr.HostFunction.hostFunctionTypeInvokeContract(
                new xdr.InvokeContractArgs({
                    contractAddress: contractAddress,
                    functionName: 'swap',
                    args: [xdr.ScVal.scvMap(swapOrderMap)]
                })
            );


            const sourceAccount = await provider.server.getAccount(walletAddress);
            const simTx = new TransactionBuilder(sourceAccount, {
                fee: '1000',
                networkPassphrase: provider.networkPassphrase,
            })
                .addOperation(
                    Operation.invokeHostFunction({
                        func: hostFunction,
                    })
                )
                .setTimeout(60)
                .build();

            const simulation = await provider.server._simulateTransaction(simTx);

            console.log({simulation}, '<<<<<<<<<<<<<<<<SIMULATION RESPONSE>>>>>>>>>>>>>>>>')
            if (simulation.error) {
                throw new Error(`Simulation error: ${simulation.error}`);
            }

            if (!simulation.transactionData) {
                throw new Error('Missing transaction data from simulation');
            }
            console.log('BEFORE ASSAMBLE');
            // return txWithResources.build();
            if (!simulation.transactionData) {
                throw new Error('Missing transaction data from simulation');
            }
            const txWithResources = SorobanRpc.assembleTransaction(simTx, simulation);
            // console.log('BEFORE BUILD');

            // const transaction = txBuilder.build();
            // console.log("AFTER BUILD")
            // return transaction;
            // const minFee = Number.parseInt(simulation.minResourceFee || '1000');
            // const totalFee = Math.max(minFee * 2, 5000);
            // const freshSourceAccount = await provider.server.getAccount(walletAddress);
            //
            // const transaction = new TransactionBuilder(freshSourceAccount, {
            //     fee: totalFee.toString(),
            //     networkPassphrase: provider.networkPassphrase,
            // })
            //     .addOperation(
            //         Operation.invokeHostFunction({
            //             func: hostFunction,
            //         })
            //     )
            //     .setTimeout(60)
            //     .setSorobanData(simulation.transactionData)
            //     .build();
            //
            // console.log({transaction}, '<<<<<<<<<<<<<<<AFTER BUILD SUCCESS')
            // return transaction;
            return txWithResources.build();


        } catch (error) {
            console.error("Error constructing swap transaction:", error);
            throw error;
        }
    }

    /**
     * Cancel Stellar intent order
     * @param orderId - Intent order ID
     * @param chainConfig - Stellar chain config
     * @param provider - Stellar provider
     */
    static async cancelIntentOrder(
        orderId: bigint,
        chainConfig: StellarChainConfig,
        provider: StellarProvider,
    ): Promise<Result<string>> {
        try {
            const sourceAccount = await provider.server.getAccount(provider.wallet.getAddress());
            const contractAddress = Address.fromString(chainConfig.intentContract).toScAddress();

            const xdrParams = [
                nativeToScVal(orderId.toString(), { type: 'u128' }),
            ];

            const hostFunction = xdr.HostFunction.hostFunctionTypeInvokeContract(
                new xdr.InvokeContractArgs({
                    contractAddress,
                    functionName: 'cancel',
                    args: xdrParams
                })
            );

            const simTx = new TransactionBuilder(sourceAccount, {
                fee: '100',
                networkPassphrase: provider.networkPassphrase,
            })
                .addOperation(
                    Operation.invokeHostFunction({
                        func: hostFunction,
                    })
                )
                .setTimeout(0)
                .build();

            const simulation = await provider.server._simulateTransaction(simTx);

            if (simulation.error) {
                throw new Error(`Simulation error: ${simulation.error}`);
            }

            if (!simulation.results) {
                throw new Error('Invalid simulation result');
            }

            const transaction = new TransactionBuilder(sourceAccount, {
                fee: '100',
                networkPassphrase: provider.networkPassphrase,
            })
                .addOperation(
                    Operation.invokeHostFunction({
                        func: hostFunction,
                        auth: []
                    })
                )
                .setTimeout(30);

            if (simulation.transactionData) {
                transaction.setSorobanData(simulation.transactionData);
            }

            const builtTx = transaction.build();

            return provider.wallet.sendTransaction(builtTx);
        } catch (e) {
            console.error("Error canceling intent order:", e);
            return {
                ok: false,
                error: e,
            };
        }
    }

    /**
     * Retrieve Intent order
     * @param txHash - Transaction hash
     * @param chainConfig - Stellar chain config
     * @param provider - Stellar provider
     */
    static async getOrder(
        txHash: string,
        chainConfig: StellarChainConfig,
        provider: StellarProvider,
    ): Promise<Result<SwapOrder>> {
        try {
            const txResult = await StellarIntentService.getTxResult(provider.server, txHash);

            if (!txResult) {
                return {
                    ok: false,
                    error: new Error(`Transaction ${txHash} not found or failed`),
                };
            }

            // Extract the SwapOrder from the transaction result
            console.log("Transaction result:", txResult);

            // Create a placeholder SwapOrder - in a real implementation,
            // you would extract the actual data from the transaction
            const swapOrder = new SwapOrder(
                0n, // ID
                chainConfig.intentContract,
                chainConfig.nid,
                "",  // dstNID
                "",  // creator
                "",  // destinationAddress
                "",  // token
                0n,  // amount
                "",  // toToken
                0n,  // toAmount
                Buffer.from([]) // data
            );

            return {
                ok: true,
                value: swapOrder,
            };
        } catch (e) {
            console.error("Error getting order:", e);
            return {
                ok: false,
                error: e,
            };
        }
    }

    /**
     * Helper function to wait for transaction finalization
     */
    private static async getTxResult(server: Server, txHash: string, maxAttempts = 8) {
        let counter = 0;
        while (true) {
            try {
                const result = await server.getTransaction(txHash);
                if (result.status === 'SUCCESS') {
                    console.log('Transaction successful:', result.status);
                    return result;
                } else {
                    await StellarIntentService.sleep(500);
                }
            } catch {
                await StellarIntentService.sleep(500);
                counter++;
            }
            if (counter > maxAttempts) {
                throw Error("Transaction not finalized after maximum attempts");
            }
        }
    }

    /**
     * Helper sleep function
     */
    private static sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}