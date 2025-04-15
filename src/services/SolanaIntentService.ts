import type { ChainConfig, CreateIntentOrderPayload, Result, SolanaChainConfig } from "../types.js";
import type { SolanaProvider, SwapOrder } from '../entities/index.js';
import { PublicKey } from "@solana/web3.js";
import { SYSTEM_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/native/system.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import * as borsh from "@coral-xyz/borsh";
import { buildV0Txn, intentConfig, intentOrder, intentOrderFinished, intentVaultNative, intentVaultToken, SwapOrderSolana } from "../utils/solana-utils.js";

const eventLogPrefix = "Program data: "

export class SolanaIntentService {
    private constructor() { }

    /**
   * Create Solana intent order
   * @param payload - Intent payload
   * @param fromChainConfig - Solana chain config
   * @param toChainConfig - Destination chain config
   * @param provider - Solana provider
   * @return string- Transaction hash
   */
    public static async createIntentOrder(
        payload: CreateIntentOrderPayload,
        fromChainConfig: SolanaChainConfig,
        toChainConfig: ChainConfig,
        provider: SolanaProvider,
    ): Promise<Result<string>> {
        try {
            const swapOrder = new SwapOrderSolana(
                new BN(0),
                fromChainConfig.intentContract,
                fromChainConfig.nid,
                toChainConfig.nid,
                payload.fromAddress,
                payload.toAddress,
                payload.token,
                new BN(payload.toAmount),
                payload.toToken,
                new BN(payload.amount),
                Buffer.from(JSON.stringify({ quote_uuid: payload.quote_uuid }))
            );

            const isNative = payload.token.toLowerCase() === fromChainConfig.nativeToken.toLowerCase();
            const creator = new PublicKey(swapOrder.creator);
            const intentProgram = new anchor.Program(
                provider.intentIdl,
                provider.provider
            )
            if (!intentProgram) {
                throw new Error("invalid intent program idl specified")
            }
            let mint = intentProgram.programId;
            let tokenVaultAccount = intentProgram.programId;
            let signerTokenAccount = intentProgram.programId;
            if (!isNative) {
                mint = new PublicKey(swapOrder.token);
                tokenVaultAccount = intentVaultToken(mint, intentProgram).pda;
                signerTokenAccount = await getAssociatedTokenAddress(mint, creator);
            }
            if (!intentProgram.methods.swap) {
                throw new Error("invalid intent idl program with no swap specified")
            }
            const txnInstruction = await intentProgram.methods
                .swap(swapOrder)
                .accountsStrict({
                    systemProgram: SYSTEM_PROGRAM_ID,
                    signer: creator,
                    config: intentConfig(intentProgram).pda,
                    orderAccount: intentOrder(
                        creator,
                        swapOrder.dstNid,
                        Number(swapOrder.amount),
                        Number(swapOrder.toAmount),
                        intentProgram
                    ).pda,
                    nativeVaultAccount: intentVaultNative(intentProgram).pda,
                    tokenVaultAccount,
                    signerTokenAccount,
                    mint,
                    tokenProgram: TOKEN_PROGRAM_ID,
                }).instruction()
            const txn = await buildV0Txn([txnInstruction], provider.wallet, provider.walletProvider?.keypair, provider.connection)
            const simulationResult = await provider.connection.simulateTransaction(txn)
            if (simulationResult.value.err) {
                return {
                    ok: false,
                    error: simulationResult.value.err,
                };
            }
            const txnResult = await provider.connection.sendTransaction(txn);
            return {
                ok: true,
                value: txnResult,
            };
        } catch (e) {
            return {
                ok: false,
                error: e,
            };
        }
    }

    /**
       * Cancel Solana intent order
       * @param orderId - Intent order ID
       * @param chainConfig - Solana chain config
       * @param provider - Icon provider
       */
    public static async cancelIntentOrderByTxnHash(
        txnHash: string,
        chainConfig: SolanaChainConfig,
        provider: SolanaProvider,
    ): Promise<Result<string>> {
        try {
            const swapOrderResult = await SolanaIntentService.getOrder(txnHash, chainConfig, provider)
            if (!swapOrderResult.ok) {
                return swapOrderResult;
            }
            const swapOrder = swapOrderResult.value
            const creator = new PublicKey(swapOrder.creator);
            const intentProgram = new anchor.Program(
                provider.intentIdl,
                provider.provider
            )
            if (!intentProgram) {
                throw new Error("invalid intent program idl specified")
            }
            let orderFinished = intentProgram.programId;
            if (swapOrder.srcNID === swapOrder.dstNID) {
                orderFinished = intentOrderFinished(swapOrder, intentProgram).pda;
            }
            if (!intentProgram.methods.cancel) {
                throw new Error("invalid intent idl program with no swap specified")
            }
            const cancelSwapOrder = new SwapOrderSolana(
                new BN(0),
                swapOrder.emitter,
                swapOrder.srcNID,
                swapOrder.dstNID,
                swapOrder.creator,
                swapOrder.destinationAddress,
                swapOrder.token,
                new BN(swapOrder.toAmount),
                swapOrder.toToken,
                new BN(swapOrder.amount),
                swapOrder.data
            );
            const txnInstruction = await intentProgram.methods
                .cancel(cancelSwapOrder)
                .accountsStrict({
                    systemProgram: SYSTEM_PROGRAM_ID,
                    signer: creator,
                    config: intentConfig(intentProgram).pda,
                    orderAccount: intentOrder(
                        creator,
                        swapOrder.dstNID,
                        Number(swapOrder.amount),
                        Number(swapOrder.toAmount),
                        intentProgram
                    ).pda,
                    orderFinished: orderFinished
                }).instruction()
            const txn = await buildV0Txn([txnInstruction], provider.wallet, provider.walletProvider?.keypair, provider.connection)
            const simulationResult = await provider.connection.simulateTransaction(txn)
            if (simulationResult.value.err) {
                return {
                    ok: false,
                    error: simulationResult.value.err,
                };
            }
            const txnResult = await provider.connection.sendTransaction(txn);
            return {
                ok: true,
                value: txnResult,
            };
        } catch (e) {
            return {
                ok: false,
                error: e,
            };
        }
    }

    /**
       * Retrieve Intent order
       * @param txHash - Transaction hash
       * @param chainConfig - Solana chain config
       * @param provider - Solana provider
       */
    static async getOrder(
        txHash: string,
        chainConfig: SolanaChainConfig,
        provider: SolanaProvider,
    ): Promise<Result<SwapOrder>> {
        try {
            const tx = await provider.connection.getTransaction(txHash, {
                commitment: "finalized",
                maxSupportedTransactionVersion: 0,
            });
            if (!tx?.meta?.err) {
                const swapOrderResult = parseSolanaSwapOrder(tx?.meta?.logMessages);
                if (swapOrderResult.ok) {
                    return {
                        ok: true,
                        value: swapOrderResult.value
                    }
                }
                return swapOrderResult;
            }
            return {
                ok: false,
                error: new Error("txn has errors"),
            };
        } catch (e) {
            return {
                ok: false,
                error: e,
            };
        }
    }
}


const parseSolanaSwapOrder = (logs: string[] | null | undefined): Result<SwapOrder> => {
    if (logs) {
        for (let log of logs) {
            if (log.startsWith(eventLogPrefix)) {
                log = log.replace(eventLogPrefix, "").trim()
                const eventSchema = borsh.struct<SwapOrder>([
                    borsh.u64("discriminator"),
                    borsh.u128("id"),
                    borsh.str("emitter"),
                    borsh.str("srcNID"),
                    borsh.str("dstNID"),
                    borsh.str("creator"),
                    borsh.str("destinationAddress"),
                    borsh.str("token"),
                    borsh.u128("amount"),
                    borsh.str("toToken"),
                    borsh.u128("toAmount"),
                    borsh.vecU8("data"),

                ])
                const buffer = Buffer.from(log, 'base64');
                const swapOrder: SwapOrder = eventSchema.decode(buffer)
                return {
                    ok: true,
                    value: swapOrder
                }
            }
        }
    }
    return {
        ok: false,
        error: new Error("no logs found")
    }
}