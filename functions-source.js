// This script is executed off-chain by the Chainlink DON.

// --- Helper Functions for Data Validation ---

/**
 * @dev Maps various product descriptions from the NFe to a canonical material type.
 * Returns 'UNKNOWN' if no match is found, which will trigger the manual fallback on-chain.
 * @param {string} description - The product description from the NFe.
 * @returns {string} - The canonical material type ('VIDRO', 'METAL', etc.) or 'UNKNOWN'.
 */
function mapMaterial(description) {
  const desc = description.toLowerCase();
  if (desc.includes("vidro")) return "VIDRO";
  if (desc.includes("sucata") || desc.includes("metalica") || desc.includes("aluminio")) return "METAL";
  // More mappings for other materials like paper or plastic can be added here.
  return "UNKNOWN";
}

// --- Main Execution Logic ---

// The NFe key is passed as the first element in the `args` array from the smart contract.
if (!args || args.length < 1) {
  throw new Error("NFe key is required as the first argument.");
}
const nfeKey = args[0];

// The API token is fetched from the DON's off-chain secret storage.
// The key "focusNfeToken" must match the key used in your secrets.json / env-enc setup.
const apiToken = await DON.secrets.get("focusNfeToken");
if (!apiToken) {
  throw new Error("Secret 'focusNfeToken' not found in DON's off-chain secrets. Please ensure it has been uploaded correctly.");
}

// The URL structure is factually defined by the Focus NFe API documentation.
const apiUrl = `https://api.focusnfe.com.br/v2/nfe/${nfeKey}`;

console.log(`Requesting data for NFe key: ${nfeKey.substring(0, 10)}...`);

// The request must use HTTP Basic Auth, with the token as the username, as per the documentation.
const apiRequest = Functions.makeHttpRequest({
  url: apiUrl,
  method: "GET",
  auth: {
    user: apiToken,
    password: "" // Password is not used for Focus NFe API
  }
});

// Await the API response.
const apiResponse = await apiRequest;

// Handle potential API errors.
if (apiResponse.error) {
  console.error("Focus NFe API Error:", apiResponse.response ? apiResponse.response.data : "No response data");
  throw new Error(`API request failed: ${apiResponse.response ? apiResponse.response.status : "Network error"}`);
}

const data = apiResponse.data;

// This path to the first product is an assumption based on typical NFe JSON structures.
// It MUST be verified against an actual response from the Focus NFe API.
if (!data.produtos || data.produtos.length < 1) {
    throw new Error("NFe data does not contain any products ('produtos').");
}
const product = data.produtos[0];
const unit = product.unidade ? product.unidade.toUpperCase() : "";
const materialDescription = product.descricao || "";
let weightKg = 0; // Default to 0. The on-chain contract interprets this as a signal for manual review.

const materialType = mapMaterial(materialDescription);
const location = data.emitente ? data.emitente.cidade : "Unknown";
const proofHash = ethers.keccak256(ethers.toUtf8Bytes(nfeKey));

// This logic handles the unit inconsistencies identified in the sample DANFEs.
if (unit === "KG") {
  weightKg = Math.round(parseFloat(product.quantidade));
} else {
  console.log(`Unit is not 'KG' (found '${unit}'). Flagging for manual verification by returning weight 0.`);
  weightKg = 0;
}

// This logic handles unknown materials, forcing a manual review.
if (materialType === "UNKNOWN" && weightKg > 0) { // Check weight to avoid double logging
  console.log(`Material '${materialDescription}' is not recognized. Flagging for manual verification by returning weight 0.`);
  weightKg = 0;
}

console.log(`Encoding result: Material=${materialType}, Weight=${weightKg}, Location=${location}`);

// The smart contract's fulfillRequest function expects the response to be abi.encoded bytes
// of the tuple: (string, uint256, string, bytes32).
const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
  ["string", "uint256", "string", "bytes32"],
  [materialType, weightKg, location, proofHash]
);

// Return the encoded bytes. The Functions Router will deliver this to the smart contract.
return ethers.getBytes(encodedData);