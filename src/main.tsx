import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { 
  ShieldCheck, Store, Repeat, ShieldAlert, FileText, Clock, 
  AlertTriangle, Copy, ArrowRightLeft, Activity, X, Users, Link2, Plus, Trash2, CheckCircle2, Info, Loader2
} from 'lucide-react'

// --- 實戰設定區 ---
// 已填入您的 TronGrid API Key
const TRONGRID_API_KEY = "ab5d8c77-fee7-4fcc-a533-faa18a67f2c1"; 

/** * 【兩層真實穿透引擎核心邏輯】
 * 1. 目標探針 (Q)：抓取 Q 客戶地址最新流入/流出流水（採樣 10 筆）。
 * 2. 真實客戶採集 (Level 1)：掃描所有註冊店家的「流向 (OUT)」對象，定義為該店真實顧客。
 * 3. 樣本流水穿透 (Level 2)：抓取這些分店真實顧客的歷史流水。
 * 4. 絕對白名單排除：若比對中發現共同關聯點是「公司錢包」，則自動標記為正常業務，不顯示關聯。
 * 5. 命中判定：
 * - 第一層直接命中：Q 地址與某店家的真實歷史客戶地址完全一致。
 * - 第二層間接關連：Q 的流水與某分店客戶的流水有共同的第三方地址（排除公司錢包）。
 */

function App() {
  const [merchantWallets, setMerchantWallets] = useState([]);
  const [newMerchantAddr, setNewMerchantAddr] = useState('');
  const [newMerchantName, setNewMerchantName] = useState('');
  const [qAddress, setQAddress] = useState('');
  const [analysisStep, setAnalysisStep] = useState(0); 
  const [finalReport, setFinalReport] = useState(null);
  const [activeTab, setActiveTab] = useState('manager');
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState(null);

  // 初始化與樣式掛載
  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(script);
    }
    const savedData = localStorage.getItem('merchant_risk_wallets');
    if (savedData) {
      try { 
        const parsed = JSON.parse(savedData);
        if (Array.isArray(parsed)) setMerchantWallets(parsed);
      } catch (e) { setMerchantWallets([]); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('merchant_risk_wallets', JSON.stringify(merchantWallets));
  }, [merchantWallets]);

  const addMerchant = () => {
    if (!newMerchantAddr || !newMerchantName) return;
    const addr = newMerchantAddr.trim();
    if (addr.length < 30) return;
    setMerchantWallets(prev => [{ id: Date.now().toString(), name: newMerchantName, address: addr, timestamp: new Date().toISOString() }, ...prev]);
    setNewMerchantAddr(''); setNewMerchantName('');
  };

  const deleteMerchant = (id) => setMerchantWallets(prev => prev.filter(m => m.id !== id));

  const handleCopy = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  };

  // --- 核心：兩層真實穿透分析引擎 ---
  const runRealDeepAnalysis = async () => {
    if (!qAddress || merchantWallets.length === 0) return;
    setFinalReport(null);
    setAnalysisStep(1); 

    const storeWhiteList = new Set(merchantWallets.map(m => m.address.toLowerCase()));
    const targetQ = qAddress.trim().toLowerCase();

    try {
      // 1. 撈取 Q 客戶的最新流水
      const qRes = await fetch(`https://api.trongrid.io/v1/accounts/${targetQ}/transactions/trc20?limit=10`, {
        headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY }
      });
      const qData = await qRes.json();
      const qLedger = (qData.data || []).map(tx => ({
        time: new Date(tx.block_timestamp).toLocaleString(),
        from: tx.from, to: tx.to,
        amount: (tx.value / Math.pow(10, tx.token_info.decimals || 6)).toFixed(2),
        type: tx.from.toLowerCase() === targetQ ? 'OUT' : 'IN'
      }));

      // 提取 Q 的第三方交易對象（排除店家）
      const qThirdPartyNodes = new Set();
      qLedger.forEach(tx => {
        const f = tx.from.toLowerCase();
        const t = tx.to.toLowerCase();
        if (!storeWhiteList.has(f) && f !== targetQ) qThirdPartyNodes.add(f);
        if (!storeWhiteList.has(t) && t !== targetQ) qThirdPartyNodes.add(t);
      });

      setAnalysisStep(2);
      
      // 2. 採集各分店真實客戶 (Level 1: 掃描店家 OUT 地址)
      const storeClientsMap = new Map(); 
      for (const merchant of merchantWallets) {
        const mRes = await fetch(`https://api.trongrid.io/v1/accounts/${merchant.address}/transactions/trc20?limit=15`, {
          headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY }
        });
        const mData = await mRes.json();
        const clients = (mData.data || [])
          .filter(tx => tx.from.toLowerCase() === merchant.address.toLowerCase())
          .map(tx => tx.to);
        storeClientsMap.set(merchant.id, [...new Set(clients)]);
      }

      setAnalysisStep(3);

      // 3. 獲取顧客流水 (Level 2) 並執行交叉比對
      const matches = [];
      for (const merchant of merchantWallets) {
        const clients = storeClientsMap.get(merchant.id) || [];
        
        for (const clientAddr of clients) {
          const cAddrLower = clientAddr.toLowerCase();
          if (storeWhiteList.has(cAddrLower)) continue;

          // 【舉例 1】：第一層地址直接命中 (Q 就是分店顧客)
          if (cAddrLower === targetQ) {
            matches.push({
              store: merchant.name,
              customerWallet: clientAddr,
              relatedAddr: "直接匹配",
              matchType: "第一層：客戶地址直接命中",
              riskLevel: "CRITICAL",
              matchedTx: qLedger[0] || { time: 'N/A', amount: '0' },
              description: `目標地址 Q 與「${merchant.name}」分店的真實客戶地址 ${clientAddr} 完全一致。`
            });
            continue; 
          }

          // 【舉例 2】：第二層流水穿透比對
          const cRes = await fetch(`https://api.trongrid.io/v1/accounts/${clientAddr}/transactions/trc20?limit=10`, {
            headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY }
          });
          const cData = await cRes.json();
          const cLedger = cData.data || [];

          for (const cTx of cLedger) {
            const cf = cTx.from.toLowerCase();
            const ct = cTx.to.toLowerCase();

            // 絕對過濾邏輯：只要連線涉及店家錢包，則不算關聯，不顯示
            if (storeWhiteList.has(cf) || storeWhiteList.has(ct)) continue;

            // 檢查 Q 是否與分店客戶有直接往來
            if (cf === targetQ || ct === targetQ) {
              matches.push({
                store: merchant.name,
                customerWallet: clientAddr,
                relatedAddr: targetQ,
                matchType: "第二層：客戶間直接往來",
                riskLevel: "HIGH",
                matchedTx: { time: new Date(cTx.block_timestamp).toLocaleString(), from: cTx.from, to: cTx.to, amount: (cTx.value/1e6).toFixed(2) },
                description: `目標 Q 與「${merchant.name}」分店顧客 ${clientAddr} 有過直接鏈上資金轉帳紀錄。`
              });
              break; 
            }

            // 檢查是否有共同第三方節點
            if (qThirdPartyNodes.has(cf) || qThirdPartyNodes.has(ct)) {
              const commonNode = qThirdPartyNodes.has(cf) ? cTx.from : cTx.to;
              matches.push({
                store: merchant.name,
                customerWallet: clientAddr,
                relatedAddr: commonNode,
                matchType: "第二層：共同第三方節點碰撞",
                riskLevel: "WARNING",
                matchedTx: { time: new Date(cTx.block_timestamp).toLocaleString(), from: cTx.from, to: cTx.to, amount: (cTx.value/1e6).toFixed(2) },
                description: `目標 Q 與「${merchant.name}」分店客戶 ${clientAddr} 均曾與外部地址 ${commonNode} 有過資金重疊（已排除公司錢包）。`
              });
              break;
            }
          }
        }
      }

      setFinalReport({ qAddress: targetQ.toUpperCase(), qLedger, timestamp: new Date().toLocaleString(), matches });
      setAnalysisStep(4);
    } catch (error) {
      console.error(error);
      setAnalysisStep(0);
      alert("分析異常，請檢查 TronGrid API 限制或地址有效性。");
    }
  };

  return (
    <div className="min-h-screen bg-[#060608] text-slate-300 font-sans p-4 md:p-8 selection:bg-blue-500/30">
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar-thumb { background: #1e1e24; border-radius: 10px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-in { animation: fadeIn 0.4s ease-out forwards; }
        .animate-spin-slow { animation: spin 15s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}} />

      <header className="max-w-[1600px] mx-auto mb-10 flex flex-col lg:flex-row justify-between items-center gap-6 border-b border-slate-800/50 pb-8">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2.5 rounded-2xl shadow-xl shadow-blue-500/20"><ShieldCheck className="text-black" size={32} /></div>
          <div>
            <h1 className="text-2xl font-black text-white italic uppercase tracking-widest leading-none">Risk Auditor</h1>
            <p className="text-[10px] text-blue-500 uppercase tracking-[0.4em] font-bold mt-1">兩層實戰穿透審計系統</p>
          </div>
        </div>
        <nav className="flex bg-slate-900/40 p-1.5 rounded-2xl border border-slate-800 backdrop-blur-md">
          <button onClick={() => setActiveTab('manager')} className={`px-8 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'manager' ? 'bg-blue-600 text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}><Store size={16} /> 公司錢包管理</button>
          <button onClick={() => setActiveTab('engine')} className={`px-8 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'engine' ? 'bg-blue-600 text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}><Repeat size={16} /> 穿透掃描引擎</button>
        </nav>
      </header>

      <main className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          {activeTab === 'manager' ? (
            <section className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 backdrop-blur-md sticky top-28 shadow-xl">
              <h2 className="text-white font-bold mb-6 flex items-center gap-2 text-sm uppercase tracking-widest">註冊公司錢包</h2>
              <div className="space-y-4">
                <input type="text" value={newMerchantName} onChange={e => setNewMerchantName(e.target.value)} placeholder="店面名稱" className="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-4 text-sm focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                <input type="text" value={newMerchantAddr} onChange={e => setNewMerchantAddr(e.target.value)} placeholder="地址 (T...)" className="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-4 text-sm font-mono focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                <button onClick={addMerchant} className="w-full bg-blue-600 hover:bg-blue-500 text-black font-black py-4 rounded-xl transition-all uppercase text-xs shadow-xl">儲存並授權掃描</button>
              </div>
              <div className="mt-8 border-t border-slate-800 pt-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-4 tracking-widest text-center">監控名單 ({merchantWallets.length})</h3>
                {merchantWallets.map(m => (
                  <div key={m.id} className="p-4 bg-black/30 rounded-2xl border border-slate-800 flex justify-between items-center mb-2 group hover:border-blue-500/30 transition-all">
                    <div className="overflow-hidden pr-4"><p className="text-xs font-bold text-white mb-1 truncate">{m.name}</p><p className="text-[9px] font-mono text-slate-500 truncate">{m.address}</p></div>
                    <button onClick={() => deleteMerchant(m.id)} className="text-slate-700 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="bg-slate-900/40 border border-slate-800 rounded-3xl p-8 backdrop-blur-md sticky top-28 shadow-2xl">
              <h2 className="text-white font-bold mb-8 flex items-center gap-2 text-red-500 uppercase italic tracking-widest"><ShieldAlert size={20} /> 實時穿透引擎</h2>
              <div className="space-y-6">
                <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl">
                    <p className="text-[10px] text-blue-400 font-bold mb-2 uppercase tracking-widest flex items-center gap-2"><Info size={14}/> 穿透模式說明</p>
                    <p className="text-[11px] text-slate-500 italic leading-relaxed">
                        系統將自動識別分店真實客戶名單，並深度分析 Q 與客戶在第三方節點上的資金交集，自動排除內部轉帳誤報。
                    </p>
                </div>
                <input type="text" value={qAddress} onChange={e => setQAddress(e.target.value)} placeholder="輸入待查 Q 客戶地址..." className="w-full bg-black border border-slate-800 rounded-2xl px-5 py-5 text-sm font-mono text-white focus:ring-1 focus:ring-blue-500 outline-none shadow-2xl shadow-blue-900/10" />
                <button onClick={runRealDeepAnalysis} disabled={analysisStep > 0 && analysisStep < 4} className="w-full bg-white text-black font-black py-5 rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-3 shadow-2xl uppercase tracking-widest">
                  {analysisStep > 0 && analysisStep < 4 ? <Loader2 className="animate-spin" size={20}/> : null}
                  啟動實戰穿透
                </button>
              </div>
              {analysisStep > 0 && (
                <div className="mt-8 space-y-4 animate-in">
                  <div className={`flex items-center gap-3 text-xs ${analysisStep >= 1 ? 'text-blue-400' : 'text-slate-600'}`}>
                    <div className={`w-2 h-2 rounded-full ${analysisStep >= 1 ? 'bg-blue-500 animate-pulse' : 'bg-slate-800'}`}></div>
                    撈取目標 Q 的鏈上流水 (L1)...
                  </div>
                  <div className={`flex items-center gap-3 text-xs ${analysisStep >= 2 ? 'text-blue-400' : 'text-slate-600'}`}>
                    <div className={`w-2 h-2 rounded-full ${analysisStep >= 2 ? 'bg-blue-500 animate-pulse' : 'bg-slate-800'}`}></div>
                    識別分店真實客戶名單 (L1)...
                  </div>
                  <div className={`flex items-center gap-3 text-xs ${analysisStep >= 3 ? 'text-blue-400' : 'text-slate-600'}`}>
                    <div className={`w-2 h-2 rounded-full ${analysisStep >= 3 ? 'bg-blue-500 animate-pulse' : 'bg-slate-800'}`}></div>
                    二層流水交叉比對與過濾 (L2)...
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="lg:col-span-8">
          {finalReport ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-[2.5rem] shadow-2xl animate-in pb-10">
              <div className="p-10 bg-gradient-to-br from-[#0c0c0e] to-black border-b border-slate-800 flex justify-between items-start">
                <div>
                  <h3 className="text-3xl font-black text-white italic uppercase mb-3 underline decoration-blue-500/50 underline-offset-8">審計穿透報告</h3>
                  <div className="flex items-center gap-2 mt-6 bg-blue-500/5 p-3 rounded-xl border border-blue-500/10">
                    <p className="text-[12px] text-blue-500 font-mono font-bold whitespace-nowrap overflow-x-auto py-1 flex-1 tracking-tight">TARGET: {finalReport.qAddress}</p>
                    <button onClick={() => handleCopy(finalReport.qAddress)} className="text-slate-600 hover:text-white shrink-0"><Copy size={16}/></button>
                  </div>
                </div>
                <FileText className="text-slate-800 opacity-50 shrink-0" size={64} />
              </div>

              <div className="p-10 space-y-12">
                <section>
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6 px-2 flex items-center gap-2"><Clock size={16} className="text-blue-500" /> 第一層：Q 客戶真實流水 (採樣 10 筆)</h4>
                  <div className="bg-black/40 rounded-3xl border border-slate-800 overflow-hidden shadow-inner overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-[11px] font-mono min-w-[1000px]">
                      <thead className="bg-white/5 text-slate-500 border-b border-slate-800 uppercase tracking-widest">
                        <tr><th className="px-6 py-4">時間</th><th className="px-6 py-4">FROM</th><th className="px-6 py-4 text-center">方向</th><th className="px-6 py-4">TO</th><th className="px-6 py-4 text-right">金額 (USDT)</th></tr>
                      </thead>
                      <tbody>
                        {finalReport.qLedger.map((tx, i) => (
                          <tr key={i} className="hover:bg-white/5 border-b border-slate-800/30 transition-colors">
                            <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{tx.time}</td>
                            <td className="px-6 py-4 select-all font-bold">{tx.from}</td>
                            <td className="px-6 py-4 text-center"><span className={`px-2 py-0.5 rounded font-black text-[9px] ${tx.type === 'IN' ? 'bg-blue-500/10 text-blue-400' : 'bg-orange-500/10 text-orange-400'}`}>{tx.type}</span></td>
                            <td className="px-6 py-4 select-all font-bold">{tx.to}</td>
                            <td className="px-6 py-4 text-right font-bold text-slate-200">{tx.amount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  <h4 className="text-[11px] font-bold text-red-500 uppercase tracking-widest mb-8 px-2 flex items-center gap-2"><AlertTriangle size={16} /> 真實兩層碰撞結果 (排除公司錢包)</h4>
                  <div className="space-y-6">
                    {finalReport.matches.length > 0 ? finalReport.matches.map((m, i) => (
                      <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-[2.5rem] p-8 flex flex-col md:flex-row gap-8 items-center group hover:border-red-500/30 transition-all shadow-xl">
                        <div className="md:w-1/4 border-r border-slate-800/50 pr-6">
                          <p className="text-[10px] text-slate-500 uppercase mb-2 font-bold tracking-widest">關聯分店</p>
                          <div className="text-white font-black text-xl italic uppercase truncate">{m.store}</div>
                          <div className={`text-[9px] font-bold px-3 py-1 rounded mt-2 inline-block ${m.riskLevel === 'CRITICAL' ? 'bg-red-500/10 text-red-500 border-red-500/30' : 'bg-orange-500/10 text-orange-400 border-orange-400/30'}`}>{m.matchType}</div>
                        </div>
                        <div className="flex-1 overflow-hidden space-y-4 w-full">
                          <div className="flex flex-col lg:flex-row gap-4 items-center">
                            <div className="flex-1 w-full overflow-hidden">
                              <p className="text-[10px] text-slate-500 uppercase font-bold mb-2 tracking-widest">分店真實客戶地址 (L1)</p>
                              <p className="text-[12px] font-mono text-white whitespace-nowrap overflow-x-auto custom-scrollbar-h bg-black/40 p-4 rounded-xl border border-slate-800 font-bold py-3 shadow-inner select-all">{m.customerWallet}</p>
                            </div>
                            <ArrowRightLeft className="text-slate-800 hidden lg:block shrink-0" size={24} />
                            <div className="flex-1 w-full overflow-hidden">
                              <p className="text-[10px] text-red-400 uppercase font-bold mb-2 tracking-widest">碰撞共同節點 (L2)</p>
                              <p className="text-[12px] font-mono text-red-400 whitespace-nowrap overflow-x-auto custom-scrollbar-h bg-red-500/5 p-4 rounded-xl border border-red-500/20 shadow-lg font-bold py-3 select-all">{m.relatedAddr}</p>
                            </div>
                          </div>
                          <div className="flex justify-end gap-3 mt-4"><button onClick={() => {setModalData(m); setShowModal(true);}} className="bg-emerald-600 text-black font-black px-8 py-3 rounded-xl text-[10px] uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-lg">證據記錄</button></div>
                        </div>
                      </div>
                    )) : (
                        <div className="p-20 text-center bg-black/20 rounded-[2rem] border border-dashed border-slate-800 animate-in">
                            <ShieldCheck size={48} className="mx-auto mb-4 text-emerald-500 opacity-50" />
                            <p className="text-sm font-bold text-slate-500 italic leading-relaxed">
                                經由兩層主網穿透分析，目前 Q 地址與各分店客戶在外部節點上無異常重疊。
                            </p>
                        </div>
                    )}
                  </div>
                </section>
                <div className="pt-10 border-t border-slate-800 flex justify-center">
                  <button onClick={() => {setQAddress(''); setFinalReport(null); setAnalysisStep(0);}} className="flex items-center gap-3 text-xs font-bold text-slate-500 hover:text-white transition-all uppercase bg-slate-900/50 px-12 py-4 rounded-full border border-slate-800 shadow-xl"><Repeat size={16} /> 啟動新審計</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[750px] flex flex-col items-center justify-center bg-slate-900/20 rounded-[4rem] border-2 border-dashed border-slate-800/50 text-slate-600 p-20 text-center shadow-inner">
               <Repeat size={80} className="opacity-10 text-blue-500 animate-spin-slow mb-8" />
               <h3 className="text-2xl font-black text-slate-400 tracking-tighter uppercase italic tracking-widest leading-relaxed">System Ready</h3>
               <p className="text-sm mt-4 text-slate-500 max-w-md leading-relaxed italic">請在左側輸入地址。系統將自動掃描分店流向地址識別真實客戶並執行二層穿透比對。</p>
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && modalData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 animate-in">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={() => setShowModal(false)}></div>
          <div className="relative w-full max-w-7xl bg-[#0c0c0e] border border-emerald-500/30 rounded-[3rem] shadow-2xl flex flex-col max-h-full overflow-hidden">
            <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-gradient-to-r from-emerald-950/20 to-transparent px-12">
              <div className="flex items-center gap-5"><div className="bg-emerald-500 p-3 rounded-2xl shadow-lg"><Activity className="text-black" size={28} /></div><div><h4 className="text-2xl font-black text-white italic uppercase tracking-tighter leading-none">兩層穿透鏈上證據錄</h4><p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mt-1">Audit Traceability Verified</p></div></div>
              <button onClick={() => setShowModal(false)} className="bg-slate-900 p-3 rounded-2xl text-slate-500 hover:text-red-400 transition-all border border-slate-800 group"><X size={24} /></button>
            </div>
            <div className="p-12 overflow-y-auto custom-scrollbar space-y-12 px-16">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-black/60 p-8 rounded-[2rem] border border-slate-800 shadow-inner"><h5 className="text-[10px] font-bold text-slate-500 uppercase mb-4 tracking-widest font-bold">當前查驗對象 Q (Source)</h5><p className="text-[15px] font-mono text-white select-all break-all font-bold leading-relaxed">{qAddress}</p></div>
                <div className="bg-red-500/5 p-8 rounded-[2rem] border border-red-500/20 shadow-xl"><h5 className="text-[10px] font-bold text-red-400 uppercase mb-4 tracking-widest font-bold">命中分店客戶地址</h5><p className="text-[15px] font-mono text-red-400 select-all break-all font-bold leading-relaxed">{modalData.customerWallet}</p></div>
              </div>
              <div className="bg-black/60 rounded-[2.5rem] border border-slate-800 overflow-x-auto shadow-2xl">
                <table className="w-full text-left text-[13px] font-mono border-collapse min-w-[1000px]">
                  <thead className="bg-white/5 text-slate-500 uppercase tracking-widest border-b border-slate-800"><tr><th className="px-10 py-6">證據時間</th><th className="px-10 py-6">FROM (源)</th><th className="px-6 py-6 text-center">狀態</th><th className="px-10 py-6">TO (匯)</th><th className="px-10 py-6 text-right">金額 (USDT)</th></tr></thead>
                  <tbody>
                    <tr className="bg-emerald-500/10 transition-colors"><td className="px-10 py-8 text-slate-400 whitespace-nowrap font-bold">{modalData.matchedTx.time}</td><td className="px-10 py-8 select-all break-all font-bold">{modalData.matchedTx.from}</td><td className="px-6 py-8 text-center"><span className="text-[9px] font-black bg-emerald-500 text-black px-2 py-0.5 rounded shadow-lg uppercase tracking-widest whitespace-nowrap">Chain Verified</span></td><td className="px-10 py-8 select-all break-all font-bold text-red-400">{modalData.matchedTx.to}</td><td className="px-10 py-8 text-right font-black text-emerald-400 text-2xl tracking-tighter">{modalData.matchedTx.amount} <span className="text-[10px] text-slate-500 font-normal">USDT</span></td></tr>
                  </tbody>
                </table>
              </div>
              <div className="bg-emerald-500/5 p-12 rounded-[3rem] border border-emerald-500/20 shadow-inner px-16">
                <div className="flex items-center gap-4 mb-5"><CheckCircle2 size={32} className="text-emerald-500" /><h4 className="text-xl font-black text-white italic uppercase tracking-tighter underline decoration-blue-500/30 underline-offset-4">AI 審計診斷結論</h4></div>
                <p className="text-[16px] text-slate-400 leading-relaxed italic max-w-5xl">
                    {modalData.description} 基於波場主網實時穿透，系統偵測到雙方在非公司控制的外部共同節點「${modalData.relatedAddr}」有顯著資金匯集跡象，排除所有公司錢包後，判定具有風控關聯風險。
                </p>
              </div>
            </div>
            <div className="p-10 border-t border-slate-800 bg-slate-900/40 flex justify-end px-16"><button onClick={() => setShowModal(false)} className="px-14 py-5 bg-white text-black font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-xs tracking-widest shadow-xl">關閉詳情</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- 最終修正：最穩定的渲染初始化方式 ---
const container = document.getElementById('root');
if (container) {
  // 使用具名導入的 createRoot，這在大多數 Vite 配置中是最可靠的
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
