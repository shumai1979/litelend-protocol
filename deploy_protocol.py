import os
import json
import time
from dotenv import load_dotenv
from web3 import Web3
from solcx import compile_standard, install_solc

# Install specific solc version if not present
install_solc("0.8.20")

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))
PRIVATE_KEY = os.getenv("PRIVATE_KEY")
if not PRIVATE_KEY:
    raise ValueError("PRIVATE_KEY not found in .env")

# LitVM LiteForge RPC
RPC_URL = "https://liteforge.rpc.caldera.xyz/http"
w3 = Web3(Web3.HTTPProvider(RPC_URL))

if not w3.is_connected():
    raise ConnectionError("Failed to connect to LitVM LiteForge testnet.")

print("Connected to LitVM LiteForge!")

account = w3.eth.account.from_key(PRIVATE_KEY)
address = account.address
print(f"Deployer Address: {address}")

def compile_contract(file_name):
    print(f"Compiling {file_name}...")
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), file_name), "r", encoding="utf-8") as file:
        source_code = file.read()

    compiled_sol = compile_standard(
        {
            "language": "Solidity",
            "sources": {file_name: {"content": source_code}},
            "settings": {
                "outputSelection": {
                    "*": {"*": ["abi", "metadata", "evm.bytecode", "evm.sourceMap"]}
                }
            },
        },
        solc_version="0.8.20",
    )
    return compiled_sol

def deploy_contract(compiled_sol, file_name, contract_name, *args):
    bytecode = compiled_sol["contracts"][file_name][contract_name]["evm"]["bytecode"]["object"]
    abi = compiled_sol["contracts"][file_name][contract_name]["abi"]

    print(f"Deploying {contract_name}...")
    Contract = w3.eth.contract(abi=abi, bytecode=bytecode)
    nonce = w3.eth.get_transaction_count(address)
    
    transaction = Contract.constructor(*args).build_transaction({
        "chainId": 4441,
        "gasPrice": w3.eth.gas_price,
        "from": address,
        "nonce": nonce,
    })
    
    signed_txn = w3.eth.account.sign_transaction(transaction, private_key=PRIVATE_KEY)
    print("Sending transaction...")
    tx_hash = w3.eth.send_raw_transaction(signed_txn.raw_transaction)
    print(f"Waiting for receipt (tx_hash: {tx_hash.hex()})...")
    tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    
    contract_address = tx_receipt.contractAddress
    print(f"{contract_name} deployed at: {contract_address}\n")
    return contract_address, abi

# 1. Compile
mock_compiled = compile_contract("MockToken.sol")
litelend_compiled = compile_contract("LiteLend.sol")

# 2. Deploy Mock Tokens
mUSDC_addr, mUSDC_abi = deploy_contract(mock_compiled, "MockToken.sol", "MockToken", "Mock USDC", "mUSDC")
mUSDT_addr, mUSDT_abi = deploy_contract(mock_compiled, "MockToken.sol", "MockToken", "Mock USDT", "mUSDT")

# 3. Deploy LiteLend
litelend_addr, litelend_abi = deploy_contract(litelend_compiled, "LiteLend.sol", "LiteLend", mUSDC_addr, mUSDT_addr)

# 4. Seed Liquidity
print("Seeding liquidity for the protocol...")
mUSDC_contract = w3.eth.contract(address=mUSDC_addr, abi=mUSDC_abi)
mUSDT_contract = w3.eth.contract(address=mUSDT_addr, abi=mUSDT_abi)
litelend_contract = w3.eth.contract(address=litelend_addr, abi=litelend_abi)

seed_amount = 1000000 * 10**6 # 1 million tokens

def send_tx(tx_dict, name):
    nonce = w3.eth.get_transaction_count(address)
    tx_dict['nonce'] = nonce
    signed = w3.eth.account.sign_transaction(tx_dict, private_key=PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    w3.eth.wait_for_transaction_receipt(tx_hash)
    print(f"{name} completed.")

print("Approving mUSDC...")
tx = mUSDC_contract.functions.approve(litelend_addr, seed_amount).build_transaction({"chainId": 4441, "from": address, "gasPrice": w3.eth.gas_price})
send_tx(tx, "Approve mUSDC")

print("Seeding mUSDC liquidity...")
tx = litelend_contract.functions.seedLiquidity(mUSDC_addr, seed_amount).build_transaction({"chainId": 4441, "from": address, "gasPrice": w3.eth.gas_price})
send_tx(tx, "Seed mUSDC")

print("Approving mUSDT...")
tx = mUSDT_contract.functions.approve(litelend_addr, seed_amount).build_transaction({"chainId": 4441, "from": address, "gasPrice": w3.eth.gas_price})
send_tx(tx, "Approve mUSDT")

print("Seeding mUSDT liquidity...")
tx = litelend_contract.functions.seedLiquidity(mUSDT_addr, seed_amount).build_transaction({"chainId": 4441, "from": address, "gasPrice": w3.eth.gas_price})
send_tx(tx, "Seed mUSDT")

print("\n=== DEPLOYMENT COMPLETE ===")
print(f"Mock USDC: {mUSDC_addr}")
print(f"Mock USDT: {mUSDT_addr}")
print(f"LiteLend : {litelend_addr}")

# Write Addresses to a JSON file for the frontend to consume
config = {
    "USDC": mUSDC_addr,
    "USDT": mUSDT_addr,
    "LiteLend": litelend_addr,
    "chainId": 4441,
    "rpcUrl": "https://liteforge.rpc.caldera.xyz/http"
}

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json"), "w") as f:
    json.dump(config, f, indent=4)

# Also update the React App config
react_config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "litelend-app", "src", "config.json")
if os.path.exists(os.path.dirname(react_config_path)):
    with open(react_config_path, "w") as f:
        json.dump(config, f, indent=4)
    print("Updated litelend-app/src/config.json")

print("Saved config.json")
