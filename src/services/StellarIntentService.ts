import { stringToBytes } from "viem";
import { SwapOrder, type StellarProvider } from "../entities/index.js";
import type {
  ChainConfig,
  CreateIntentOrderPayload,
  Result,
  StellarChainConfig,
} from "../types.js";
import {
  TransactionBuilder,
  type Transaction,
  xdr,
  Address,
  Operation,
  SorobanRpc,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import {Api, type Server} from "@stellar/stellar-sdk/rpc";
import { bigintToUInt128Parts, extractScVal } from "../utils/stellar-utils.js";
import isSimulationSuccess = Api.isSimulationSuccess;
import isSimulationRestore = Api.isSimulationRestore;

export class StellarIntentService {
  private constructor() {}

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

      const { transaction, continueExecution } = await StellarIntentService.constructSwapTransaction(
        intent,
        fromChainConfig,
        provider,
      );

      return provider.wallet.sendTransaction(transaction, continueExecution);
    } catch (e) {
      console.error("Error creating intent order:", e);
      return {
        ok: false,
        error: e,
      };
    }
  }

  /**
   * @param intent - The SwapOrder object containing all details for the swap intent
   * @param chainConfig - Configuration for the Stellar chain, including the intent contract address
   * @param provider - The StellarProvider instance for account info and transaction submission
   * @returns A fully assembled and ready-to-sign Stellar transaction
   */
  private static async constructSwapTransaction(
    intent: SwapOrder,
    chainConfig: StellarChainConfig,
    provider: StellarProvider,
  ): Promise<{ transaction: Transaction; continueExecution?: (() => Promise<Transaction>) }>  {
    try {
      const walletAddress = provider.wallet.getAddress();
      const contractAddress = Address.fromString(
        chainConfig.intentContract,
      ).toScAddress();

      const swapOrderMap = [
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("amount"),
          val: xdr.ScVal.scvU128(bigintToUInt128Parts(intent.amount)),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("creator"),
          val: xdr.ScVal.scvString(intent.creator),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("data"),
          val: xdr.ScVal.scvBytes(Buffer.from(intent.data)),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("destination_address"),
          val: xdr.ScVal.scvString(intent.destinationAddress),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("dst_nid"),
          val: xdr.ScVal.scvString(intent.dstNID),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("emitter"),
          val: xdr.ScVal.scvString(intent.emitter),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("id"),
          val: xdr.ScVal.scvU128(bigintToUInt128Parts(intent.id)),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("src_nid"),
          val: xdr.ScVal.scvString(intent.srcNID),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("to_amount"),
          val: xdr.ScVal.scvU128(bigintToUInt128Parts(intent.toAmount)),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("to_token"),
          val: xdr.ScVal.scvString(intent.toToken),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("token"),
          val: xdr.ScVal.scvString(intent.token),
        }),
      ];

      const hostFunction = xdr.HostFunction.hostFunctionTypeInvokeContract(
        new xdr.InvokeContractArgs({
          contractAddress: contractAddress,
          functionName: "swap",
          args: [xdr.ScVal.scvMap(swapOrderMap)],
        }),
      );

      const sourceAccountForSimulation = await provider.server.getAccount(walletAddress);
      const simulationTransaction = new TransactionBuilder(sourceAccountForSimulation, {
        fee: BASE_FEE.toString(),
        networkPassphrase: provider.networkPassphrase,
      })
        .addOperation(
          Operation.invokeHostFunction({
            func: hostFunction,
          }),
        )
        .setTimeout(60)
        .build();

      const transactionResponse = await provider.server.simulateTransaction(simulationTransaction)
      const simulationForFee = await provider.server._simulateTransaction(simulationTransaction);

      if(!isSimulationSuccess(transactionResponse)){
        throw new Error(`Simulation Failed: ${JSON.stringify(transactionResponse)}`);
      }

      const executeTransactionFn = async () => {
        const priorityFee = '10000';
        const minResourceFee = simulationForFee.minResourceFee || BASE_FEE.toString();
        const totalFee = (BigInt(priorityFee) + BigInt(minResourceFee)).toString();

        const sourceAccount = await provider.server.getAccount(walletAddress);
        const priorityTransaction = new TransactionBuilder(sourceAccount, {
          fee: totalFee,
          networkPassphrase: provider.networkPassphrase,
        })
            .addOperation(
                Operation.invokeHostFunction({
                  func: hostFunction,
                }),
            )
            .setTimeout(60)
            .build();

        const simulation = await provider.server._simulateTransaction(priorityTransaction);

        if (simulation.error) {
          throw new Error(`Simulation error: ${simulation.error}`);
        }

        if (!simulation.transactionData) {
          throw new Error("Missing transaction data from simulation");
        }
        const txWithResources = SorobanRpc.assembleTransaction(priorityTransaction, simulation);
        return txWithResources.build();
      }

      if(isSimulationRestore(transactionResponse)){
        const account = await provider.server.getAccount(walletAddress);
        const fee = (Number.parseInt(BASE_FEE) + Number.parseInt(transactionResponse.minResourceFee)).toString();
        const restoreTx = new TransactionBuilder(account, {fee})
            .setNetworkPassphrase(provider.networkPassphrase)
            .setSorobanData(transactionResponse.transactionData.build())
            .addOperation(Operation.restoreFootprint({}))
            .setTimeout(200)
            .build();

        return { transaction: restoreTx, continueExecution: executeTransactionFn };
      };

      return {
        transaction: await executeTransactionFn(),
      };

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
      const walletAddress = provider.wallet.getAddress();
      const contractAddress = Address.fromString(
        chainConfig.intentContract,
      ).toScAddress();

      const hostFunction = xdr.HostFunction.hostFunctionTypeInvokeContract(
        new xdr.InvokeContractArgs({
          contractAddress: contractAddress,
          functionName: "cancel",
          args: [xdr.ScVal.scvU128(bigintToUInt128Parts(orderId))],
        }),
      );

      const sourceAccount = await provider.server.getAccount(walletAddress);

      const simTx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE.toString(),
        networkPassphrase: provider.networkPassphrase,
      })
        .addOperation(
          Operation.invokeHostFunction({
            func: hostFunction,
          }),
        )
        .setTimeout(60)
        .build();

      const simulation = await provider.server._simulateTransaction(simTx);

      if (simulation.error) {
        throw new Error(`Simulation error: ${simulation.error}`);
      }

      if (!simulation.transactionData) {
        throw new Error("Missing transaction data from simulation");
      }

      const txWithResources = SorobanRpc.assembleTransaction(simTx, simulation);
      return provider.wallet.sendTransaction(txWithResources.build());
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
      const tx = await StellarIntentService.getTxResult(
        provider.server,
        txHash,
      );

      if (!tx || !tx.resultMetaXdr) {
        return {
          error: "Transaction not found or missing metadata",
          ok: false,
        };
      }

      const events = tx.resultMetaXdr?.v3()?.sorobanMeta()?.events() || [];
      const swapIntentData: { [key: string]: string | bigint | Uint8Array } =
        {};

      for (let i = 0; i < events.length; i++) {
        try {
          const event = events[i];
          const bodyV0 = event?.body().v0();
          const topics = bodyV0?.topics();

          if (topics && topics[0] && topics.length > 0) {
            const eventType = extractScVal(topics[0]);

            if (eventType === "SwapIntent") {
              const data = bodyV0?.data();
              if (data && data.switch) {
                if (data.switch().name === "scvMap") {
                  const map = data.map();
                  if (!map) {
                    return { error: "Invalid map data", ok: false };
                  }
                  for (let j = 0; j < map.length; j++) {
                    const entry = map[j];
                    if (!entry || !entry.key || !entry.val) {
                      return { error: "Invalid map entry", ok: false };
                    }
                    const key = extractScVal(entry.key());
                    if (!key) {
                      return { error: "Invalid map key", ok: false };
                    }
                    const value = extractScVal(entry.val());
                    if (typeof key === "string") {
                      swapIntentData[key] = value;
                    }
                  }
                }
              }

              break;
            }
          }
        } catch (err) {
          return {
            error: err,
            ok: false,
          };
        }
      }

      return {
        ok: true,
        value: new SwapOrder(
          swapIntentData.id as bigint,
          swapIntentData.emitter as string,
          swapIntentData.srcNID as string,
          swapIntentData.dstNID as string,
          swapIntentData.creator as string,
          swapIntentData.destinationAddress as string,
          swapIntentData.token as string,
          swapIntentData.amount as bigint,
          swapIntentData.toToken as string,
          swapIntentData.toAmount as bigint,
          swapIntentData.data as Uint8Array,
        ),
      };
    } catch (error) {
      console.error("Error in getSwapIntentData:", error);
      return { error: error || "Unknown error", ok: false };
    }
  }

  /**
   * @param server - The Stellar server instance to query
   * @param txHash - The transaction hash to look up
   * @param maxAttempts - Maximum number of retry attempts (default: 3)
   * @returns The transaction result object if successful
   */
  private static async getTxResult(
    server: Server,
    txHash: string,
    maxAttempts = 30,
  ) {
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const result = await server.getTransaction(txHash);

        if (result.status === "SUCCESS") {
          return result;
        }

        attempts++;

        if (attempts < maxAttempts) {
          await StellarIntentService.sleep(1000);
        }
      } catch (error) {
        attempts++;

        if (attempts < maxAttempts) {
          await StellarIntentService.sleep(1000);
        }
      }
    }

    throw Error("Transaction not found after maximum attempts");
  }

  /**
   * Helper sleep function
   * @param ms - Time in milliseconds
   */
  private static sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
