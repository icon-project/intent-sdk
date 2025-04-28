import { xdr } from "@stellar/stellar-sdk";
import type {StellarProviderType} from "../libs/StellarWalletProvider.js";
import type * as StellarSdk from "@stellar/stellar-sdk";


export function bigintToUInt128Parts(value: bigint): xdr.UInt128Parts {

  if (value < BigInt("0x10000000000000000")) {
    return new xdr.UInt128Parts({
      lo: xdr.Uint64.fromString(value.toString()),
      hi: xdr.Uint64.fromString("0"),
    });
  }

  const hiPart = value >> BigInt(64);
  const loPart = value & BigInt("0xffffffffffffffff");

  return new xdr.UInt128Parts({
    lo: xdr.Uint64.fromString(loPart.toString()),
    hi: xdr.Uint64.fromString(hiPart.toString()),
  });
}

export function extractScVal(val: InstanceType<typeof xdr.ScVal>) {
  if (!val || !val.switch) return '';

  try {
    const switchName = val.switch().name;

    switch (switchName) {
      case 'scvU128':
        try {
          const hi = BigInt(val.u128().hi().toString());
          const lo = BigInt(val.u128().lo().toString());
          return ((hi << 64n) + BigInt(lo));
        } catch (e) {
          console.error("Error extracting U128:", e);
          return "U128_ERROR";
        }

      case 'scvI128':
        try {
          const hi = BigInt(val.i128().hi().toString());
          const lo = BigInt(val.i128().lo().toString());
          return ((hi << 64n) + lo);
        } catch (e) {
          return "I128_ERROR";
        }

      case 'scvString':
        return val.str().toString();

      case 'scvSymbol':
        return val.sym().toString();

      case 'scvBytes':
        try {
          return Buffer.from(val.bytes());
        } catch (e) {
          return "BYTES_ERROR";
        }

      default:
        return `[${switchName}]`;
    }
  } catch (error) {
    console.error("Error in extractScVal:", error);
    return "EXTRACTION_ERROR";
  }
}

export function isPrivateKeyWallet (KeyPair: StellarSdk.Keypair | undefined)  {
return !!KeyPair;
}

export function isProviderWallet (privateKey: string | undefined, provider: StellarProviderType | undefined): boolean | undefined  {
return !privateKey && !!provider && 'signTransaction' in provider;
}

export function isTransactionContainSignature (transaction: StellarSdk.Transaction)  {
  return !transaction.signatures || transaction.signatures.length === 0;
}

