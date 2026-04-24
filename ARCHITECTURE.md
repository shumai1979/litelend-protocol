# LiteLend Protocol: Technical Architecture

LiteLend is a decentralized lending and borrowing protocol built on the LitVM LiteForge network. It enables users to supply stablecoin collateral and borrow against it in a trustless manner.

## Components

### 1. Smart Contracts
- `LiteLend.sol`: The core lending engine managing positions, interest rates, and liquidations.
- `MockToken.sol`: Utility tokens (mUSDC, mUSDT) for network testing and protocol simulation.
- `Token.sol`: Native utility token for protocol governance and liquidity management.

### 2. Infrastructure
- `deploy_protocol.py`: Automated deployment script for the lending infrastructure.
- `deploy_token.py`: Deployment script for utility tokens.
- `protocol_monitor.py`: Network monitoring and automated protocol maintenance loop.
- `client_simulator.py`: Automated stress-testing script simulating protocol activity.

### 3. Frontend
- `litelend-app/`: Modern React-based dApp for user interaction.
- `litelend.html`: Legacy lightweight interface for emergency access.

## Network Configuration
- **Chain ID**: 4441 (LitVM LiteForge)
- **RPC**: https://liteforge.rpc.caldera.xyz/http
- **Explorer**: https://liteforge.explorer.caldera.xyz
