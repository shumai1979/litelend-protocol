import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { Wallet, Info, ArrowUpRight, ArrowDownLeft, ShieldCheck, Zap, Activity, Coins } from 'lucide-react';
import config from './config.json';

const SELECTORS = {
  supply: "0xf2b9fdb8",
  withdraw: "0xf3fef3a3",
  borrow: "0x4b8a3529",
  repay: "0x22867d78",
  getStats: "0xc59d4847",
  getPosition: "0x16c19739",
  getLiquidity: "0x0910a510"
};

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)"
];

function App() {
  const [address, setAddress] = useState('');
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [stats, setStats] = useState({ totalSupplied: '0', totalBorrowed: '0', netApy: '5.20' });
  const [position, setPosition] = useState({ supUSDC: '0', supUSDT: '0', borUSDC: '0', borUSDT: '0', limitUsed: '0' });
  const [balances, setBalances] = useState({ usdc: '0', usdt: '0' });
  const [liquidity, setLiquidity] = useState({ usdc: '0', usdt: '0' });
  const [loading, setLoading] = useState(false);

  const connectWallet = async () => {
    if (!window.ethereum) return alert("MetaMask not found!");
    try {
      const p = new ethers.BrowserProvider(window.ethereum);
      await p.send("eth_requestAccounts", []);
      const s = await p.getSigner();
      const addr = await s.getAddress();
      
      setProvider(p);
      setSigner(s);
      setAddress(addr);

      // Switch Network
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: ethers.toBeHex(config.chainId) }]
        });
      } catch (err) {
        if (err.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: ethers.toBeHex(config.chainId),
              chainName: 'LitVM LiteForge',
              rpcUrls: [config.rpcUrl],
              nativeCurrency: { name: "LTC", symbol: "LTC", decimals: 18 },
              blockExplorerUrls: ["https://liteforge.explorer.caldera.xyz"]
            }]
          });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchData = useCallback(async () => {
    if (!provider || !address) return;
    try {
      // 1. Balances
      const usdc = new ethers.Contract(config.USDC, ERC20_ABI, provider);
      const usdt = new ethers.Contract(config.USDT, ERC20_ABI, provider);
      const bUsdc = await usdc.balanceOf(address);
      const bUsdt = await usdt.balanceOf(address);
      setBalances({ usdc: ethers.formatUnits(bUsdc, 6), usdt: ethers.formatUnits(bUsdt, 6) });

      // 2. Protocol Stats
      const statRes = await provider.call({ to: config.LiteLend, data: SELECTORS.getStats });
      if (statRes !== "0x") {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256","uint256","uint256","uint256","uint256"], statRes);
        setStats(prev => ({ ...prev, totalSupplied: ethers.formatUnits(decoded[0], 6), totalBorrowed: ethers.formatUnits(decoded[1], 6) }));
      }

      // 3. User Position
      const posRes = await provider.call({
        to: config.LiteLend,
        data: SELECTORS.getPosition + ethers.AbiCoder.defaultAbiCoder().encode(["address"], [address]).slice(2)
      });
      if (posRes !== "0x") {
        const p = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256","uint256","uint256","uint256","uint256","bool"], posRes);
        const col = Number(p[0]) + Number(p[1]);
        const debt = Number(p[2]) + Number(p[3]);
        setPosition({
          supUSDC: ethers.formatUnits(p[0], 6),
          supUSDT: ethers.formatUnits(p[1], 6),
          borUSDC: ethers.formatUnits(p[2], 6),
          borUSDT: ethers.formatUnits(p[3], 6),
          limitUsed: col > 0 ? ((debt / col) * 100).toFixed(2) : '0'
        });
      }

      // 4. Liquidity
      const liqRes = await provider.call({ to: config.LiteLend, data: SELECTORS.getLiquidity });
      if (liqRes !== "0x") {
        const l = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], liqRes);
        setLiquidity({ usdc: ethers.formatUnits(l[0], 6), usdt: ethers.formatUnits(l[1], 6) });
      }
    } catch (e) {
      console.error(e);
    }
  }, [provider, address]);

  useEffect(() => {
    if (address) {
      fetchData();
      const interval = setInterval(fetchData, 15000);
      return () => clearInterval(interval);
    }
  }, [address, fetchData]);

  const doAction = async (tokenSym, action, amount) => {
    if (!signer || !amount || isNaN(amount) || amount <= 0) return;
    setLoading(true);
    const tokenAddr = tokenSym === 'USDC' ? config.USDC : config.USDT;
    const amountWei = ethers.parseUnits(amount, 6);

    try {
      if (action === 'supply' || action === 'repay') {
        const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
        const allw = await token.allowance(address, config.LiteLend);
        if (allw < amountWei) {
          const tx = await token.approve(config.LiteLend, ethers.MaxUint256);
          await tx.wait();
        }
      }

      const data = SELECTORS[action] + ethers.AbiCoder.defaultAbiCoder().encode(["address","uint256"], [tokenAddr, amountWei]).slice(2);
      const tx = await signer.sendTransaction({ to: config.LiteLend, data: data });
      await tx.wait();
      fetchData();
    } catch (e) {
      console.error(e);
      alert("Transaction failed!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base text-slate-100 font-sans selection:bg-primary selection:text-white">
      {/* Background Glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none"></div>
      
      <nav className="relative border-b border-slate-800 bg-bg-base/80 backdrop-blur-md px-6 py-4 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <Zap className="text-white w-6 h-6 fill-white" />
          </div>
          <div>
            <h1 className="font-syne font-bold text-xl tracking-tight">LiteLend <span className="text-primary">Protocol</span></h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">LitVM LiteForge</span>
            </div>
          </div>
        </div>
        
        <button 
          onClick={connectWallet}
          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 flex items-center gap-2"
        >
          <Wallet size={16} className={address ? 'text-primary' : 'text-slate-400'} />
          {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connect Wallet'}
        </button>
      </nav>

      <main className="relative max-w-7xl mx-auto px-6 py-12 z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Stats Bar */}
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard icon={<Coins className="text-primary"/>} label="Total Supplied" value={`$${Number(stats.totalSupplied).toLocaleString()}`} />
            <StatCard icon={<Activity className="text-primary"/>} label="Total Borrowed" value={`$${Number(stats.totalBorrowed).toLocaleString()}`} />
            <StatCard icon={<ShieldCheck className="text-emerald-500"/>} label="Net APY" value="5.20%" sub="Earn yield on stablecoins" />
          </div>

          {/* Left Column: Supply */}
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-bg-card border border-slate-800 rounded-3xl p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-8">
                <h2 className="font-syne font-bold text-2xl flex items-center gap-3">
                  Supply Assets <span className="bg-primary/10 text-primary text-xs px-3 py-1 rounded-full border border-primary/20">LTV 80%</span>
                </h2>
              </div>

              <div className="space-y-4">
                <AssetRow 
                  sym="USDC" 
                  name="mUSDC" 
                  bal={balances.usdc} 
                  sup={position.supUSDC} 
                  onAction={(a, amt) => doAction('USDC', a, amt)}
                  loading={loading}
                />
                <AssetRow 
                  sym="USDT" 
                  name="mUSDT" 
                  bal={balances.usdt} 
                  sup={position.supUSDT} 
                  onAction={(a, amt) => doAction('USDT', a, amt)}
                  loading={loading}
                />
              </div>
            </section>
          </div>

          {/* Right Column: Borrow Status & Markets */}
          <div className="space-y-6">
             <section className="bg-bg-card border border-slate-800 rounded-3xl p-8 shadow-2xl">
                <h2 className="font-syne font-bold text-xl mb-6">Your Health Factor</h2>
                <div className="relative pt-1">
                  <div className="flex mb-2 items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-primary bg-primary/10">
                        Borrow Limit
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold inline-block text-primary">
                        {position.limitUsed}%
                      </span>
                    </div>
                  </div>
                  <div className="overflow-hidden h-2 mb-4 text-xs flex rounded-full bg-slate-800">
                    <div style={{ width: `${position.limitUsed}%` }} className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${Number(position.limitUsed) > 80 ? 'bg-rose-500' : 'bg-primary'}`}></div>
                  </div>
                </div>
                <p className="text-xs text-slate-500">Keep your borrow limit below 80% to avoid liquidation.</p>
             </section>

             <section className="bg-bg-card border border-slate-800 rounded-3xl p-8 shadow-2xl">
                <h2 className="font-syne font-bold text-xl mb-6 flex items-center gap-2">
                  Borrowing <span className="text-slate-500 text-sm font-normal">APR 8.9%</span>
                </h2>
                <div className="space-y-6">
                  <BorrowRow sym="USDC" bor={position.borUSDC} liq={liquidity.usdc} onAction={(a, amt) => doAction('USDC', a, amt)} loading={loading} />
                  <BorrowRow sym="USDT" bor={position.borUSDT} liq={liquidity.usdt} onAction={(a, amt) => doAction('USDT', a, amt)} loading={loading} />
                </div>
             </section>
          </div>

        </div>
      </main>

      <footer className="py-12 border-t border-slate-800 text-center text-slate-500 text-sm">
        <p>&copy; 2026 LiteLend Protocol. Built for the LitVM Ecosystem.</p>
      </footer>
    </div>
  );
}

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="bg-bg-card border border-slate-800 p-6 rounded-3xl">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-slate-800/50 rounded-lg">{icon}</div>
        <span className="text-slate-400 text-sm font-medium">{label}</span>
      </div>
      <div className="text-3xl font-syne font-bold">{value}</div>
      {sub && <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">{sub}</p>}
    </div>
  );
}

function AssetRow({ sym, name, bal, sup, onAction, loading }) {
  const [val, setVal] = useState('');
  return (
    <div className="bg-slate-900/50 border border-slate-800/50 p-6 rounded-2xl group hover:border-primary/30 transition-all">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xs ${sym === 'USDC' ? 'bg-[#2775ca]' : 'bg-[#26a17b]'}`}>
            {sym}
          </div>
          <div>
            <h3 className="font-bold text-lg">{name}</h3>
            <p className="text-xs text-slate-500">Wallet: {Number(bal).toFixed(2)}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold font-syne text-primary">{Number(sup).toFixed(2)}</div>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Supplied</p>
        </div>
      </div>
      
      <div className="flex gap-2">
        <input 
          type="number" 
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0.00"
          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all"
        />
        <button 
          disabled={loading}
          onClick={() => { onAction('supply', val); setVal(''); }}
          className="bg-primary hover:bg-blue-600 px-6 rounded-xl font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-50"
        >
          <ArrowUpRight size={16} /> Supply
        </button>
        <button 
          disabled={loading}
          onClick={() => { onAction('withdraw', val); setVal(''); }}
          className="bg-slate-800 hover:bg-slate-700 px-6 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
        >
          Withdraw
        </button>
      </div>
    </div>
  );
}

function BorrowRow({ sym, bor, liq, onAction, loading }) {
  const [val, setVal] = useState('');
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end">
        <div className="flex items-center gap-3">
           <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] ${sym === 'USDC' ? 'bg-[#2775ca]' : 'bg-[#26a17b]'}`}>
            {sym}
          </div>
          <div>
            <h4 className="font-bold text-sm">{sym}</h4>
            <p className="text-[10px] text-slate-500">Liquidity: {Number(liq).toFixed(0)}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold">{Number(bor).toFixed(2)}</div>
          <p className="text-[10px] text-slate-500">Borrowed</p>
        </div>
      </div>
      <div className="flex gap-2">
         <input 
          type="number" 
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0.00"
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary transition-all"
        />
        <button 
          disabled={loading}
          onClick={() => { onAction('borrow', val); setVal(''); }}
          className="bg-emerald-600 hover:bg-emerald-500 px-4 rounded-lg font-bold text-xs transition-all disabled:opacity-50"
        >
          Borrow
        </button>
        <button 
          disabled={loading}
          onClick={() => { onAction('repay', val); setVal(''); }}
          className="bg-slate-800 hover:bg-slate-700 px-4 rounded-lg font-bold text-xs transition-all disabled:opacity-50"
        >
          Repay
        </button>
      </div>
    </div>
  );
}

export default App;
