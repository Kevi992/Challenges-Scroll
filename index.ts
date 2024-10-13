import { config as dotenv } from "dotenv";
import {
  createWalletClient,
  http,
  getContract,
  erc20Abi,
  parseUnits,
  maxUint256,
  publicActions,
  concat,
  numberToHex,
  size,
} from "viem";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { scroll } from "viem/chains";
import { wethAbi } from "./abi/weth-abi";

/* 
This code is part of the 0x Challenge on the Scroll platform. 
The objectives are to:
1. Showcase the distribution of liquidity sources by percentage.
2. Integrate monetization through affiliate fees and surplus gathering.
3. Present buy/sell tax rates for tokens that impose them.
4. List all liquidity sources available on the Scroll network.
*/

const qs = require("qs");

// Initialize environment variables
dotenv();
const { PRIVATE_KEY, ZERO_EX_API_KEY, ALCHEMY_HTTP_TRANSPORT_URL } = process.env;

// Check for essential environment variables
if (!PRIVATE_KEY) throw new Error("Private key is missing.");
if (!ZERO_EX_API_KEY) throw new Error("0x API key is missing.");
if (!ALCHEMY_HTTP_TRANSPORT_URL) throw new Error("Alchemy HTTP transport URL is missing.");

// Create request headers for API calls
const headers = new Headers({
  "Content-Type": "application/json",
  "0x-api-key": ZERO_EX_API_KEY,
  "0x-version": "v2",
});

// Establish a wallet client
const client = createWalletClient({
  account: privateKeyToAccount(`0x${PRIVATE_KEY}` as `0x${string}`),
  chain: scroll,
  transport: http(ALCHEMY_HTTP_TRANSPORT_URL),
}).extend(publicActions); // Include public actions to the wallet client

const [address] = await client.getAddresses();

// Define smart contracts for WETH and WSTETH
const weth = getContract({
  address: "0x5300000000000000000000000000000000000004",
  abi: wethAbi,
  client,
});
const wsteth = getContract({
  address: "0xf610A9dfB7C89644979b4A0f27063E9e7d7Cda32",
  abi: erc20Abi,
  client,
});

// Function to show the percentage share of different liquidity sources
function displayLiquiditySources(route: any) {
  const fills = route.fills;
  const totalBps = fills.reduce((acc: number, fill: any) => acc + parseInt(fill.proportionBps), 0);
  
  console.log(`${fills.length} Sources`);
  fills.forEach((fill: any) => {
    const percentage = (parseInt(fill.proportionBps) / 100).toFixed(2);
    console.log(`${fill.source}: ${percentage}%`);
  });
}

// Function to present the buy/sell tax rates for tokens
function displayTokenTaxes(tokenMetadata: any) {
  const buyTokenBuyTax = (parseInt(tokenMetadata.buyToken.buyTaxBps) / 100).toFixed(2);
  const buyTokenSellTax = (parseInt(tokenMetadata.buyToken.sellTaxBps) / 100).toFixed(2);
  const sellTokenBuyTax = (parseInt(tokenMetadata.sellToken.buyTaxBps) / 100).toFixed(2);
  const sellTokenSellTax = (parseInt(tokenMetadata.sellToken.sellTaxBps) / 100).toFixed(2);

  if (buyTokenBuyTax > 0 || buyTokenSellTax > 0) {
    console.log(`Buy Token Buy Tax: ${buyTokenBuyTax}%`);
    console.log(`Buy Token Sell Tax: ${buyTokenSellTax}%`);
  }

  if (sellTokenBuyTax > 0 || sellTokenSellTax > 0) {
    console.log(`Sell Token Buy Tax: ${sellTokenBuyTax}%`);
    console.log(`Sell Token Sell Tax: ${sellTokenSellTax}%`);
  }
}

// Async function to retrieve and list all liquidity sources on Scroll
const getLiquiditySources = async () => {
  const chainId = client.chain.id.toString(); // Confirm this matches the Scroll chain ID
  const sourcesParams = new URLSearchParams({
    chainId: chainId,
  });

  const sourcesResponse = await fetch(
    `https://api.0x.org/swap/v1/sources?${sourcesParams.toString()}`,
    {
      headers,
    }
  );

  const sourcesData = await sourcesResponse.json();
  const sources = Object.keys(sourcesData.sources);
  console.log("Available liquidity sources on the Scroll chain:");
  console.log(sources.join(", "));
};

const main = async () => {
  // Retrieve and display all liquidity sources on Scroll
  await getLiquiditySources();

  // Define the amount to sell
  const decimals = (await weth.read.decimals()) as number;
  const sellAmount = parseUnits("0.1", decimals);

  // Set parameters for affiliate fees and surplus collection
  const affiliateFeeBps = "100"; // Represents 1%
  const surplusCollection = "true";

  // Prepare request parameters for price retrieval with monetization
  const priceParams = new URLSearchParams({
    chainId: client.chain.id.toString(),
    sellToken: weth.address,
    buyToken: wsteth.address,
    sellAmount: sellAmount.toString(),
    taker: client.account.address,
    affiliateFee: affiliateFeeBps, // Affiliate fee parameter
    surplusCollection: surplusCollection, // Surplus collection parameter
  });

  const priceResponse = await fetch(
    "https://api.0x.org/swap/permit2/price?" + priceParams.toString(),
    {
      headers,
    }
  );

  const price = await priceResponse.json();
  console.log("Retrieving price to exchange 0.1 WETH for WSTETH");
  console.log(
    `Price API Call: https://api.0x.org/swap/permit2/price?${priceParams.toString()}`
  );
  console.log("Price Response Data: ", price);

  // Check if the taker needs to set an allowance for Permit2
  if (price.issues.allowance !== null) {
    try {
      const { request } = await weth.simulate.approve([
        price.issues.allowance.spender,
        maxUint256,
      ]);
      console.log("Granting approval for Permit2 to spend WETH...", request);
      // Execute the approval
      const hash = await weth.write.approve(request.args);
      console.log(
        "Permit2 has been authorized to spend WETH.",
        await client.waitForTransactionReceipt({ hash })
      );
    } catch (error) {
      console.log("Error during Permit2 approval:", error);
    }
  } else {
    console.log("WETH is already approved for Permit2");
  }

  // Retrieve the quote using the monetization parameters
  const quoteParams = new URLSearchParams();
  for (const [key, value] of priceParams.entries()) {
    quoteParams.append(key, value);
  }

  const quoteResponse = await fetch(
    "https://api.0x.org/swap/permit2/quote?" + quoteParams.toString(),
    {
      headers,
    }
  );

  const quote = await quoteResponse.json();
  console.log("Retrieving quote to swap 0.1 WETH for WSTETH");
  console.log("Quote Response Data: ", quote);

  // Display the percentage breakdown of liquidity sources
  if (quote.route) {
    displayLiquiditySources(quote.route);
  }

  // Show the buy/sell taxes for tokens
  if (quote.tokenMetadata) {
    displayTokenTaxes(quote.tokenMetadata);
  }

  // Present monetization information
  if (quote.affiliateFeeBps) {
    const affiliateFee = (parseInt(quote.affiliateFeeBps) / 100).toFixed(2);
    console.log(`Affiliate Fee: ${affiliateFee}%`);
  }

  if (quote.tradeSurplus && parseFloat(quote.tradeSurplus) > 0) {
    console.log(`Trade Surplus Collected: ${quote.tradeSurplus}`);
  }

  // Sign the permit2.eip712 returned from the quote
  let signature: Hex | undefined;
  if (quote.permit2?.eip712) {
    try {
      signature = await client.signTypedData(quote.permit2.eip712);
      console.log("Permit2 message from quote response signed successfully.");
    } catch (error) {
      console.error("Error signing the Permit2 coupon:", error);
    }

    // Append signature length and data to transaction.data
    if (signature && quote?.transaction?.data) {
      const signatureLengthInHex = numberToHex(size(signature), {
        signed: false,
        size: 32,
      });

      const transactionData = quote.transaction.data as Hex;
      const sigLengthHex = signatureLengthInHex as Hex;
      const sig = signature as Hex;

      quote.transaction.data = concat([transactionData, sigLengthHex, sig]);
    } else {
      throw new Error("Could not obtain signature or transaction data");
    }
  }

  // Execute the transaction with the Permit2 signature
  if (signature && quote.transaction.data) {
    const nonce = await client.getTransactionCount({
      address: client.account.address,
    });

    const signedTransaction = await client.signTransaction({
      account: client.account,
      chain: client.chain,
      gas: quote?.transaction.gas ? BigInt(quote.transaction.gas) : undefined,
      to: quote?.transaction.to,
      data: quote.transaction.data,
      value: quote?.transaction.value
        ? BigInt(quote.transaction.value)
        : undefined, // For native tokens
      gasPrice: quote?.transaction.gasPrice
        ? BigInt(quote.transaction.gasPrice)
        : undefined,
      nonce: nonce,
    });
    const hash = await client.sendRawTransaction({
      serializedTransaction: signedTransaction,
    });

    console.log("Transaction hash generated:", hash);
    console.log(`View transaction details at https://scrollscan.com/tx/${hash}`);
  } else {
    console.error("Failed to acquire a signature; transaction not sent.");
  }
};

main();
