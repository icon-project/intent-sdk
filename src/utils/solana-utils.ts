import createKeccakHash from "keccak";
import * as rlp from "rlp";
import * as borsh from "@coral-xyz/borsh";
import type * as anchor from "@coral-xyz/anchor";
import { type Connection, type Keypair, PublicKey, type TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import type { SwapOrder } from "../entities/SwapOrder.js";
import type { Wallet } from "@coral-xyz/anchor/dist/cjs/provider.js";
import type { Result } from "../types.js";
const eventLogPrefix = "Program data: "

function keccakHash(message: Buffer) {
    return createKeccakHash("keccak256").update(message).digest("hex");
};

export async function buildV0Txn(instructions: TransactionInstruction[],
    wallet: Wallet | undefined, signers: Keypair | undefined, connection: Connection) {
    const blockHash = await connection
        .getLatestBlockhash()
        .then((res) => res.blockhash);
    let pubKey = PublicKey.default;
    if (wallet) {
        pubKey = wallet.publicKey
    } else if (signers) {
        pubKey = signers.publicKey
    } else {
        throw new Error("no signing method found")
    }
    const messageV0 = new TransactionMessage({
        payerKey: pubKey,
        recentBlockhash: blockHash,
        instructions,
    }).compileToV0Message();
    const tx = new VersionedTransaction(messageV0);
    if (wallet) {
        return await wallet.signTransaction(tx)
    } else if (signers) {
        tx.sign([signers]);
    }
    return tx;
}


export async function waitForConfirmation(signature: string, connection: Connection) {
    const commitment = "finalized";
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    }, commitment);
}


export const parseSolanaSwapOrder = (logs: string[] | null | undefined): Result<SwapOrder> => {
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

function encodeSwapOrder(swapOrder: SwapOrder) {
    const rlpInput: rlp.Input = [
        swapOrder.id,
        swapOrder.emitter,
        swapOrder.srcNID,
        swapOrder.dstNID,
        swapOrder.creator,
        swapOrder.destinationAddress,
        swapOrder.token,
        swapOrder.amount,
        swapOrder.toToken,
        swapOrder.toAmount,
        swapOrder.data,
    ];
    return rlp.encode(rlpInput);
}

function uint128ToArray(input: string | number) {
    const num = BigInt(input);
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    view.setBigUint64(0, num >> BigInt(64), false);
    view.setBigUint64(8, num & BigInt("0xFFFFFFFFFFFFFFFF"), false);
    return new Uint8Array(buffer);
};

export class SwapOrderSolana {
    id: bigint;
    emitter: string;
    srcNid: string;
    dstNid: string;
    creator: string;
    destinationAddress: string;
    token: string;
    amount: bigint;
    toToken: string;
    toAmount: bigint;
    data: Uint8Array;

    constructor(
        id: bigint,
        emitter: string,
        srcNid: string,
        dstNid: string,
        creator: string,
        destinationAddress: string,
        token: string,
        amount: bigint,
        toToken: string,
        toAmount: bigint,
        data: Uint8Array,
    ) {
        this.id = id;
        this.emitter = emitter;
        this.srcNid = srcNid;
        this.dstNid = dstNid;
        this.creator = creator;
        this.destinationAddress = destinationAddress;
        this.token = token;
        this.amount = amount;
        this.toToken = toToken;
        this.toAmount = toAmount;
        this.data = data;
    }
}


export function intentConfig(intentProgram: anchor.Program<anchor.Idl>) {
    const [pda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        intentProgram.programId
    );

    return { bump, pda };
}

export function intentOrder(
    creator: PublicKey,
    dstNID: string,
    amount: number,
    toAmount: number,
    intentProgram: anchor.Program<anchor.Idl>
) {
    const [pda, bump] = PublicKey.findProgramAddressSync(
        [
            creator.toBuffer(),
            Buffer.from(dstNID),
            uint128ToArray(amount),
            uint128ToArray(toAmount),
        ],
        intentProgram.programId
    );

    return { bump, pda };
}

export function intentVaultToken(mint: PublicKey, intentProgram: anchor.Program<anchor.Idl>) {
    const [pda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_token"), mint.toBuffer()],
        intentProgram.programId
    );

    return { bump, pda };
}

export function intentVaultNative(intentProgram: anchor.Program<anchor.Idl>) {
    const [pda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_native")],
        intentProgram.programId
    );

    return { bump, pda };
}

export function intentOrderFinished(order: SwapOrder, intentProgram: anchor.Program<anchor.Idl>) {
    const encoded = encodeSwapOrder(order);
    const hash = keccakHash(Buffer.from(encoded));

    const [pda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from(hash, "hex")],
        intentProgram.programId
    );

    return { pda, bump };
}
