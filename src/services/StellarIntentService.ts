import { stringToBytes } from 'viem';
import { SwapOrder, type StellarProvider } from '../entities/index.js';
import type {
    ChainConfig,
    CreateIntentOrderPayload,
    Result,
    StellarChainConfig
} from '../types.js';
import { Contract, TransactionBuilder, type Transaction, BASE_FEE, xdr } from "@stellar/stellar-sdk";

interface OrderData {
    id: string;
    emitter: string;
    src_nid: string;
    dst_nid: string;
    creator: string;
    destination_address: string;
    token: string;
    amount: string;
    to_token: string;
    to_amount: string;
    data: string | Buffer;
    [key: string]: string | Buffer; // Allow for additional string properties
}

export class StellarIntentService {
    private constructor() {}

    private static convertOrderToScVal(order: OrderData): xdr.ScVal {
        const entries = Object.entries(order).map(([key, value]) => {
            const keyScVal = xdr.ScVal.scvString(key);
            let valueScVal: xdr.ScVal;

            if (typeof value === 'string') {
                if (key === 'id' || key === 'amount' || key === 'to_amount') {
                    const longValue = BigInt(value);
                    const u128 = new xdr.UInt128Parts({
                        hi: xdr.Uint64.fromString("0"),
                        lo: xdr.Uint64.fromString(value)
                    });
                    valueScVal = xdr.ScVal.scvU128(u128);
                } else {
                    valueScVal = xdr.ScVal.scvString(value);
                }
            } else if (Buffer.isBuffer(value)) {
                valueScVal = xdr.ScVal.scvBytes(value);
            } else {
                valueScVal = xdr.ScVal.scvString(String(value));
            }

            return new xdr.ScMapEntry({ key: keyScVal, val: valueScVal });
        });

        return xdr.ScVal.scvMap(entries);
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

            const transaction = await StellarIntentService.constructSwapTransaction(
                intent, fromChainConfig, provider
            );

            return provider.wallet.sendTransaction(transaction);
        } catch (e) {
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
    ): Promise<Transaction> {
        const sourceAccount = await provider.server.getAccount(provider.wallet.getAddress());

        const orderData = {
            id: intent.id.toString(),
            emitter: intent.emitter,
            src_nid: intent.srcNID,
            dst_nid: intent.dstNID,
            creator: intent.creator,
            destination_address: intent.destinationAddress,
            token: intent.token,
            amount: intent.amount.toString(),
            to_token: intent.toToken,
            to_amount: intent.toAmount.toString(),
            data: Buffer.from(intent.data).toString('base64')
        };

        const orderScVal = StellarIntentService.convertOrderToScVal(orderData);

        const txBuilder = new TransactionBuilder(sourceAccount, {
            fee: BASE_FEE,
            networkPassphrase: provider.networkPassphrase
        });

        const contract = new Contract(chainConfig.intentContract);

        const transaction = txBuilder
            .addOperation(
                contract.call("swap", orderScVal)
            )
            .setTimeout(30)
            .build();

        return transaction;
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
            const txBuilder = new TransactionBuilder(sourceAccount, {
                fee: BASE_FEE,
                networkPassphrase: provider.networkPassphrase
            });

            const u128 = new xdr.UInt128Parts({
                hi: xdr.Uint64.fromString("0"),
                lo: xdr.Uint64.fromString(orderId.toString())
            });
            const idScVal = xdr.ScVal.scvU128(u128);

            const contract = new Contract(chainConfig.intentContract);

            const transaction = txBuilder
                .addOperation(
                    contract.call("cancel", idScVal)
                )
                .setTimeout(60)
                .build();

            return provider.wallet.sendTransaction(transaction);
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
     * @param chainConfig - Stellar chain config
     * @param provider - Stellar provider
     */
    static async getOrder(
        txHash: string,
        chainConfig: StellarChainConfig,
        provider: StellarProvider,
    ): Promise<Result<SwapOrder>> {
        try {
            const txResult = await provider.server.getTransaction(txHash)

            if (!txResult) {
                return {
                    ok: false,
                    error: new Error(`Transaction ${txHash} not found`),
                };
            }
            //TODO needs to implement as per the result
            console.log({
                txResult,
            })

            const swapOrder = new SwapOrder(
                0n,
                chainConfig.intentContract,
                chainConfig.nid,
                "",
                "",
                "",
                "",
                0n,
                "",
                0n,
                Buffer.from([])
            );

            return {
                ok: true,
                value: swapOrder,
            };
        } catch (e) {
            return {
                ok: false,
                error: e,
            };
        }
    }


}