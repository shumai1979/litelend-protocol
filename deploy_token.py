import json
import os
from web3 import Web3
from solcx import install_solc, compile_standard
from dotenv import load_dotenv

# 1. Definir o caminho base do projeto (onde o script está localizado)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
TOKEN_PATH = os.path.join(BASE_DIR, "Token.sol")

# Carregar variáveis do ficheiro .env
load_dotenv(ENV_PATH)

# =================================================================
# CONFIGURAÇÕES DA REDE (LitVM LiteForge)
# =================================================================
RPC_URL = "https://liteforge.rpc.caldera.xyz/http"
CHAIN_ID = 4441

# LER DOS VARIÁVEIS DE AMBIENTE
PRIVATE_KEY = os.getenv("PRIVATE_KEY")
ACCOUNT_ADDRESS = os.getenv("ACCOUNT_ADDRESS")

# =================================================================

def deploy():
    if not PRIVATE_KEY or not ACCOUNT_ADDRESS:
        print("[!] ERRO: Falta configurar o ficheiro .env com PRIVATE_KEY e ACCOUNT_ADDRESS.")
        return

    # Conectar à rede
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("[-] Erro ao conectar à LitVM. Verifica o RPC_URL ou a tua ligação.")
        return

    print(f"[+] Ligado à LitVM.")
    try:
        balance = w3.eth.get_balance(ACCOUNT_ADDRESS)
        print(f"[+] Saldo da conta: {w3.from_wei(balance, 'ether')} zkLTC")
    except Exception as e:
        print(f"[!] Erro ao obter saldo: {e}. Verifica se o teu endereço está correto.")
        return

    # 2. Compilar o Contrato
    print("[*] A instalar compilador Solidity 0.8.0...")
    install_solc("0.8.0")
    
    with open(TOKEN_PATH, "r") as file:
        contract_source_code = file.read()

    print("[*] A compilar o contrato...")
    compiled_sol = compile_standard(
        {
            "language": "Solidity",
            "sources": {"Token.sol": {"content": contract_source_code}},
            "settings": {
                "outputSelection": {
                    "*": {"*": ["abi", "metadata", "evm.bytecode", "evm.sourceMap"]}
                }
            },
        },
        solc_version="0.8.0",
    )

    # Extrair Bytecode e ABI
    bytecode = compiled_sol["contracts"]["Token.sol"]["LiteForgeUtilityToken"]["evm"]["bytecode"]["object"]
    abi = compiled_sol["contracts"]["Token.sol"]["LiteForgeUtilityToken"]["abi"]

    # 3. Preparar a Transação
    print("[*] A preparar a transação de deploy...")
    TokenContract = w3.eth.contract(abi=abi, bytecode=bytecode)
    nonce = w3.eth.get_transaction_count(ACCOUNT_ADDRESS)

    # Construir transação (Supply inicial: 1.000.000 tokens)
    transaction = TokenContract.constructor(1000000).build_transaction({
        "chainId": CHAIN_ID,
        "gas": 3000000,
        "gasPrice": w3.eth.gas_price,
        "nonce": nonce,
    })

    # 4. Assinar e Enviar
    print("[*] A enviar para a rede...")
    signed_txn = w3.eth.account.sign_transaction(transaction, private_key=PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed_txn.raw_transaction)

    # 5. Confirmar
    print(f"[*] Aguardando confirmação (TX: {tx_hash.hex()})...")
    tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    
    print("\n" + "="*50)
    print(f"[SUCCESS] Contrato implantado!")
    print(f"Endereço do Contrato: {tx_receipt.contractAddress}")
    print(f"Verificar no Explorador: https://liteforge.explorer.caldera.xyz/tx/{tx_hash.hex()}")
    print("="*50)

if __name__ == "__main__":
    deploy()
