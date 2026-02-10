import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { 
  ShieldCheck, Store, Repeat, ShieldAlert, FileText, Clock, 
  AlertTriangle, Copy, ArrowRightLeft, Activity, X, Users, Link2, Plus, Trash2, CheckCircle2, Info, Loader2
} from 'lucide-react'

// --- 實戰設定區 ---
const TRONGRID_API_KEY = "ab5d8c77-fee7-4fcc-a533-faa18a67f2c1"; 

/** * 【全真實一層穿透引擎 - 測試版】
 * 1. 目標 Q 流水：真實抓取 Q 地址的最新 15 筆交易。
 * 2. 店家客戶採集：掃描店家 OUT 地址，取得真實顧客清單。
 * 3. 一層碰撞比對：
 * - Q 地址是否等於店家客戶。
 * - Q 的交易對手是否與店家客戶重疊。
 * 4. 絕對過濾：排除所有涉及公司錢包的正常往來。
 */

function App() {
  const [merchantWallets, setMerchantWallets] = useState<any[]>([]);
  const [newMerchantAddr, setNewMerchantAddr] = useState('');
  const [newMerchantName, setNewMerchantName] = useState('');
  const [qAddress, setQAddress] = useState('');
  const [analysisStep, setAnalysisStep] = useState(0); 
  const [qLedger, setQLedger] = useState<any[]>([]); 
  const [finalReport, setFinalReport] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('manager');
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<any>(null);

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

  const deleteMerchant = (id: string) => setMerchantWallets(prev => prev.filter(m => m.id !== id));

  const handleCopy = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  };

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  // --- API 請求包裝器（含 429 退避與錯誤診斷） ---
  const fetchWithRetry = async (url: string, retries = 3, backoff = 1000): Promise<any> => {
    try {
      const response = await fetch(url, {
        headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY }
      });
      if (response.status === 429 && retries > 0) {
        await delay(backoff);
        return fetchWithRetry(url, retries - 1, backoff * 2);
      }
      if (response.status === 429) throw new Error("API 請求過快 (429)，請稍候再試。");
      const data = await response.json();
      if (!data.success) throw new Error("TronGrid 回傳異常。");
      return data;
    } catch (err: any) {
      if (retries > 0) {
        await delay(backoff);
        return fetchWithRetry(url, retries - 1, backoff * 2);
      }
      throw err;
    }
  };

  // --- 核心分析引擎：一層真實穿透 ---
  const runRealAnalysis = async () => {
    if (!qAddress || merchantWallets.length === 0) return;
    setFinalReport(null);
    setQLedger([]);
    setAnalysisStep(1); 

    const storeWhiteList = new Set(merchantWallets.map(m => m.address.toLowerCase()));
    const targetQ = qAddress.trim().toLowerCase();

    try {
      // 1. 撈取目標 Q 的流水 (Level 1)
      const qData = await fetchWithRetry(`https://api.trongrid.io/v1/accounts/${targetQ}/transactions/trc20?limit=15`);
      const fetchedQLedger = qData.data.map((tx: any) => ({
        time: new Date(tx.block_timestamp).toLocaleString(),
        from: tx.from, to: tx.to,
        amount: (tx.value / Math.pow(10, tx.token_info.decimals || 6)).toFixed(2),
        type: tx.from.toLowerCase() === targetQ ? 'OUT' : 'IN'
      }));

      setQLedger(fetchedQLedger);

      // 提取 Q 的所有第三方交易對手
      const qPartners = new Set<string>();
      fetchedQLedger.forEach((tx: any) => {
        const f = tx.from.toLowerCase();
        const t = tx.to.toLowerCase();
        if (!storeWhiteList.has(f) && f !== targetQ) qPartners.add(f);
        if (!storeWhiteList.has(t) && t !== targetQ) qPartners.add(t);
      });

      setAnalysisStep(2);
      await delay(500);
      
      // 2. 獲取各分店真實客戶名單
      const matches: any[] = [];
      for (const merchant of merchantWallets) {
        const mData = await fetchWithRetry(`https://api.trongrid.io/v1/accounts/${merchant.address}/transactions/trc20?limit=20`);
        
        // 取得店家所有 OUT 流向的地址 (即真實顧客)
        const merchantCustomers = (mData.data || [])
          .filter((tx: any) => tx.from.toLowerCase() === merchant.address.toLowerCase())
          .map((tx: any) => tx.to.toLowerCase());

        const customerSet = new Set(merchantCustomers);

        // 比對 A: 直接命中 (Q 是該店客戶)
        if (customerSet.has(targetQ)) {
          matches.push({
            store: merchant.name,
            customerWallet: qAddress,
            relatedAddr: "直接匹配",
            matchType: "一層：客戶直接命中",
            riskLevel: "CRITICAL",
            matchedTx: fetchedQLedger[0] || { time: 'N/A', amount: '0' },
            description: `地址 Q 曾直接從「${merchant.name}」分店接收資金。`
          });
        } else {
          // 比對 B: 節點碰撞 (Q 的對手是該店客戶)
          for (const partner of Array.from(qPartners)) {
            if (customerSet.has(partner.toLowerCase())) {
              const matchedLedgerTx = fetchedQLedger.find((tx: any) => 
                tx.from.toLowerCase() === partner.toLowerCase() || 
                tx.to.toLowerCase() === partner.toLowerCase()
              );

              matches.push({
                store: merchant.name,
                customerWallet: partner,
                relatedAddr: partner,
                matchType: "一層：資金節點重疊",
                riskLevel: "HIGH",
                matchedTx: matchedLedgerTx,
                description: `發現 Q 的交易對手 ${partner} 同時也是「${merchant.name}」分店的客戶。`
              });
              break; // 每個分店找到一個命中點就跳過，避免重複
            }
          }
        }
        await delay(300);
      }

      setFinalReport({ 
        qAddress: targetQ.toUpperCase(), 
        qLedger: fetchedQLedger,
        timestamp: new Date().toLocaleString(), 
        matches 
      });
      setAnalysisStep(4);
    } catch (error: any) {
      console.error(error);
      setAnalysisStep(0);
      alert(error.message || "抓取失敗。");
    }
  };

  return (
    <div className="min-h-screen bg-[#050507] text-slate-300 font-sans p-4 md:p-8">
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar-thumb { background: #1e1e24; border-radius: 10px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-in { animation: fadeIn 0.4s ease-out forwards; }
      `}} />

      <header className="max-w-6xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/20"><ShieldCheck className="text-black" size={28} /></div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight italic uppercase">Risk Audit Lite</h1>
            <p className="text-[9px] text-blue-500 uppercase tracking-widest font-bold mt-0.5">一層真實穿透比對系統</p>
          </div>
        </div>
        <nav className="flex bg-slate-900/50 p-1 rounded-2xl border border-slate-800 backdrop-blur-sm">
          <button onClick={() => setActiveTab('manager')} className={`px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'manager' ? 'bg-blue-600 text-black shadow-lg' : 'text-slate-500'}`}><Store size={14} /> 店家管理</button>
          <button onClick={() => setActiveTab('engine')} className={`px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'engine' ? 'bg-blue-600 text-black shadow-lg' : 'text-slate-500'}`}><Repeat size={14} /> 掃描比對</button>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 操作面板 */}
        <div className="lg:col-span-4 space-y-6">
          {activeTab === 'manager' ? (
            <section className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
              <h2 className="text-white font-bold mb-6 flex items-center gap-2 text-sm uppercase tracking-widest">註冊店家錢包</h2>
              <div className="space-y-4">
                <input type="text" value={newMerchantName} onChange={e => setNewMerchantName(e.target.value)} placeholder="名稱" className="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-4 text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
                <input type="text" value={newMerchantAddr} onChange={e => setNewMerchantAddr(e.target.value)} placeholder="錢包地址 (T...)" className="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-4 text-sm font-mono focus:ring-1 focus:ring-blue-500 outline-none" />
                <button onClick={addMerchant} className="w-full bg-blue-600 hover:bg-blue-500 text-black font-black py-4 rounded-xl transition-all uppercase text-xs">儲存並授權掃描</button>
              </div>
              <div className="mt-8 border-t border-slate-800 pt-6 max-h-[300px] overflow-y-auto custom-scrollbar">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-4 tracking-widest">已註冊名單 ({merchantWallets.length})</h3>
                {merchantWallets.map(m => (
                  <div key={m.id} className="p-3 bg-black/30 rounded-xl border border-slate-800 flex justify-between items-center mb-2 overflow-hidden group">
                    <div className="overflow-hidden pr-2"><p className="text-xs font-bold text-white mb-0.5 truncate">{m.name}</p><p className="text-[8px] font-mono text-slate-500 truncate">{m.address}</p></div>
                    <button onClick={() => deleteMerchant(m.id)} className="text-slate-700 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 backdrop-blur-md shadow-2xl">
              <h2 className="text-white font-bold mb-8 flex items-center gap-2 text-red-500 uppercase italic tracking-widest"><ShieldAlert size={20} /> 實時穿透引擎</h2>
              <div className="space-y-6">
                <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl text-[11px] leading-relaxed">
                    <p className="text-blue-400 font-bold mb-1 uppercase tracking-widest flex items-center gap-2"><Info size={14}/> 測試模式：一層穿透</p>
                    <p className="text-slate-500 italic font-medium">系統將掃描分店流向識別「真實客戶」，並直接與 Q 的交易對象比對，排除店內轉帳誤報。</p>
                </div>
                <input type="text" value={qAddress} onChange={e => setQAddress(e.target.value)} placeholder="輸入待查 Q 客戶地址..." className="w-full bg-black border border-slate-800 rounded-2xl px-5 py-5 text-sm font-mono text-white focus:ring-1 focus:ring-blue-500 outline-none shadow-2xl" />
                <button onClick={runRealAnalysis} disabled={analysisStep > 0 && analysisStep < 4} className="w-full bg-white text-black font-black py-5 rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-3 shadow-2xl uppercase tracking-widest">
                  {analysisStep > 0 && analysisStep < 4 ? <Loader2 className="animate-spin" size={20}/> : null}
                  啟動實戰穿透
                </button>
              </div>
              {analysisStep > 0 && (
                <div className="mt-8 space-y-3 animate-in">
                  <div className={`flex items-center gap-3 text-xs ${analysisStep >= 1 ? 'text-blue-400 font-bold' : 'text-slate-600'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${analysisStep >= 1 ? 'bg-blue-500 animate-pulse' : 'bg-slate-800'}`}></div>
                    撈取目標 Q 的鏈上流水 (L1)...
                  </div>
                  <div className={`flex items-center gap-3 text-xs ${analysisStep >= 2 ? 'text-blue-400 font-bold' : 'text-slate-600'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${analysisStep >= 2 ? 'bg-blue-500 animate-pulse' : 'bg-slate-800'}`}></div>
                    識別各分店「真實流向」客戶...
                  </div>
                  <div className={`flex items-center gap-3 text-xs ${analysisStep >= 3 ? 'text-blue-400 font-bold' : 'text-slate-600'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${analysisStep >= 3 ? 'bg-blue-500 animate-pulse' : 'bg-slate-800'}`}></div>
                    執行一層流水碰撞分析...
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* 報告顯示區 */}
        <div className="lg:col-span-8">
          {(qLedger.length > 0 || finalReport) ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-[2rem] shadow-2xl animate-in pb-10 overflow-hidden">
              <div className="p-8 bg-gradient-to-br from-[#0c0c0e] to-black border-b border-slate-800 flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-black text-white italic uppercase mb-2 underline underline-offset-8 decoration-blue-500/50">審計穿透報告</h3>
                  <div className="flex items-center gap-2 mt-6 bg-blue-500/5 p-3 rounded-xl border border-blue-500/10 max-w-sm">
                    <p className="text-[11px] text-blue-500 font-mono font-bold truncate flex-1 uppercase">TARGET: {qAddress || finalReport?.qAddress}</p>
                    <button onClick={() => handleCopy(qAddress)} className="text-slate-600 hover:text-white shrink-0"><Copy size={14}/></button>
                  </div>
                </div>
                <FileText className="text-slate-800 opacity-50 shrink-0" size={48} />
              </div>

              <div className="p-8 space-y-10">
                <section>
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 px-2 flex items-center gap-2"><Clock size={14} className="text-blue-500" /> 第一層：Q 真實鏈上交易流水 (TRC20)</h4>
                  <div className="bg-black/40 rounded-2xl border border-slate-800 overflow-hidden shadow-inner overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-[10px] font-mono min-w-[800px]">
                      <thead className="bg-white/5 text-slate-500 border-b border-slate-800 uppercase">
                        <tr><th className="px-5 py-3">時間</th><th className="px-5 py-3">FROM</th><th className="px-5 py-3 text-center">方向</th><th className="px-5 py-3">TO</th><th className="px-5 py-3 text-right">金額 (USDT)</th></tr>
                      </thead>
                      <tbody>
                        {qLedger.map((tx: any, i: number) => (
                          <tr key={i} className="hover:bg-white/5 border-b border-slate-800/30 transition-colors">
                            <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{tx.time}</td>
                            <td className="px-5 py-3 select-all font-bold tracking-tighter text-slate-400">{tx.from}</td>
                            <td className="px-5 py-3 text-center"><span className={`px-2 py-0.5 rounded font-black text-[8px] ${tx.type === 'IN' ? 'bg-blue-500/10 text-blue-400' : 'bg-orange-500/10 text-orange-400'}`}>{tx.type}</span></td>
                            <td className="px-5 py-3 select-all font-bold tracking-tighter text-slate-400">{tx.to}</td>
                            <td className="px-5 py-3 text-right font-bold text-slate-200">{tx.amount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  <h4 className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-6 px-2 flex items-center gap-2"><AlertTriangle size={14} /> 一層碰撞命中結果</h4>
                  <div className="space-y-4">
                    {finalReport && finalReport.matches.length > 0 ? finalReport.matches.map((m: any, i: number) => (
                      <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row gap-6 items-center group hover:border-red-500/30 transition-all shadow-xl">
                        <div className="md:w-1/4 border-r border-slate-800/50 pr-4">
                          <p className="text-[9px] text-slate-500 uppercase mb-1 font-bold">關聯分店</p>
                          <div className="text-white font-black text-lg italic uppercase truncate">{m.store}</div>
                          <div className={`text-[8px] font-bold px-2 py-0.5 rounded mt-1.5 inline-block ${m.riskLevel === 'CRITICAL' ? 'bg-red-500/10 text-red-500 border-red-500/30' : 'bg-orange-500/10 text-orange-400 border-orange-400/30'}`}>{m.matchType}</div>
                        </div>
                        <div className="flex-1 overflow-hidden space-y-4 w-full">
                          <div className="flex flex-col lg:flex-row gap-4 items-center overflow-hidden">
                            <div className="flex-1 w-full overflow-hidden">
                              <p className="text-[9px] text-slate-500 uppercase font-bold mb-1.5 tracking-widest">分店歷史客戶地址 (L1)</p>
                              <p className="text-[11px] font-mono text-white whitespace-nowrap overflow-x-auto custom-scrollbar bg-black/40 p-3 rounded-xl border border-slate-800 font-bold select-all tracking-tighter">{m.customerWallet}</p>
                            </div>
                            <ArrowRightLeft className="text-slate-800 hidden lg:block shrink-0" size={16} />
                            <div className="flex-1 w-full overflow-hidden">
                              <p className="text-[9px] text-red-400 uppercase font-bold mb-1.5 tracking-widest">重疊命中點</p>
                              <p className="text-[11px] font-mono text-red-400 whitespace-nowrap overflow-x-auto custom-scrollbar bg-red-500/5 p-3 rounded-xl border border-red-500/20 shadow-lg font-bold select-all tracking-tighter">{m.relatedAddr}</p>
                            </div>
                          </div>
                          <div className="flex justify-end gap-3"><button onClick={() => {setModalData(m); setShowModal(true);}} className="bg-blue-600 text-black font-black px-6 py-2 rounded-xl text-[9px] uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg">查看證據錄</button></div>
                        </div>
                      </div>
                    )) : finalReport ? (
                        <div className="p-16 text-center bg-black/20 rounded-3xl border border-dashed border-slate-800 animate-in">
                            <ShieldCheck size={32} className="mx-auto mb-3 text-emerald-500 opacity-50" />
                            <p className="text-xs font-bold text-slate-500 italic leading-relaxed">
                                經一層主網穿透分析，Q 地址與註冊店鋪之顧客在主網上無直接重疊。
                            </p>
                        </div>
                    ) : (
                        <div className="p-10 text-center text-slate-600 italic text-xs uppercase tracking-widest animate-pulse font-bold">一層數據交叉分析中...</div>
                    )}
                  </div>
                </section>
                <div className="pt-8 border-t border-slate-800 flex justify-center">
                  <button onClick={() => {setQAddress(''); setQLedger([]); setFinalReport(null); setAnalysisStep(0);}} className="flex items-center gap-2 text-[10px] font-bold text-slate-500 hover:text-white transition-all uppercase bg-slate-900/50 px-8 py-3 rounded-full border border-slate-800 shadow-xl shadow-white/5"><Repeat size={14} /> 啟動新審計</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[600px] flex flex-col items-center justify-center bg-slate-900/20 rounded-[3rem] border-2 border-dashed border-slate-800/50 text-slate-600 p-20 text-center shadow-inner">
               <Repeat size={60} className="opacity-10 text-blue-500 animate-spin-slow mb-6" />
               <h3 className="text-xl font-black text-slate-400 italic uppercase tracking-widest leading-relaxed">System Ready (Lite Mode)</h3>
               <p className="text-xs mt-3 text-slate-500 max-w-md leading-relaxed italic">輸入待查地址並發起掃描。系統將執行「一層」穿透比對，自動識別分店真實客戶並過濾公司錢包誤報。</p>
            </div>
          )}
        </div>
      </main>

      {/* 詳情彈窗 */}
      {showModal && modalData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 animate-in">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={() => setShowModal(false)}></div>
          <div className="relative w-full max-w-6xl bg-[#0c0c0e] border border-blue-500/30 rounded-[2.5rem] shadow-2xl flex flex-col max-h-full overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-gradient-to-r from-blue-950/20 to-transparent px-10">
              <div className="flex items-center gap-4"><div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-500/20"><Activity className="text-black" size={24} /></div><div><h4 className="text-xl font-black text-white italic uppercase tracking-tighter">一層命中證據</h4><p className="text-[9px] text-blue-500 font-bold uppercase tracking-widest mt-0.5">Audit Confirmed: L1 Direct/Partner Match</p></div></div>
              <button onClick={() => setShowModal(false)} className="bg-slate-900 p-2.5 rounded-xl text-slate-500 hover:text-red-400 transition-all border border-slate-800"><X size={20} /></button>
            </div>
            <div className="p-10 overflow-y-auto custom-scrollbar space-y-10 px-14">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-black/60 p-6 rounded-3xl border border-slate-800 shadow-inner overflow-hidden"><h5 className="text-[9px] font-bold text-slate-500 uppercase mb-3 tracking-widest">當前查驗 Q (Source)</h5><p className="text-[13px] font-mono text-white break-all font-bold select-all leading-relaxed uppercase">{qAddress || finalReport?.qAddress}</p></div>
                <div className="bg-red-500/5 p-6 rounded-3xl border border-red-500/20 shadow-xl overflow-hidden"><h5 className="text-[9px] font-bold text-red-400 uppercase mb-3 tracking-widest font-bold">命中分店客戶實體 (Match)</h5><p className="text-[13px] font-mono text-red-400 break-all font-black select-all leading-relaxed uppercase">{modalData.customerWallet}</p></div>
              </div>
              <section>
                <div className="flex items-center gap-3 mb-5 px-1 tracking-widest"><FileText className="text-blue-500" size={18} /><h5 className="text-[11px] font-bold text-white uppercase italic">證據：鏈上 TRC20 轉帳紀錄</h5></div>
                <div className="bg-black/60 rounded-3xl border border-slate-800 overflow-x-auto shadow-2xl custom-scrollbar">
                  <table className="w-full text-left text-[11px] font-mono border-collapse min-w-[1000px]">
                    <thead className="bg-white/5 text-slate-500 uppercase border-b border-slate-800">
                      <tr><th className="px-8 py-5">時間</th><th className="px-8 py-5">FROM</th><th className="px-5 py-5 text-center">狀態</th><th className="px-8 py-5">TO</th><th className="px-8 py-5 text-right">金額 (USDT)</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      <tr className="bg-blue-500/10"><td className="px-8 py-6 text-slate-400 whitespace-nowrap font-bold">{modalData.matchedTx.time}</td><td className="px-8 py-6 whitespace-nowrap text-slate-300 font-bold select-all tracking-tighter">{modalData.matchedTx.from}</td><td className="px-5 py-6 text-center"><div className="flex flex-col items-center gap-1"><ArrowRightLeft size={16} className="text-blue-500 animate-pulse" /><span className="text-[8px] font-black bg-blue-500 text-black px-1.5 py-0.5 rounded shadow-lg uppercase tracking-widest">Matched</span></div></td><td className="px-8 py-6 whitespace-nowrap text-red-400 font-black select-all tracking-tighter">{modalData.matchedTx.to}</td><td className="px-8 py-6 text-right font-black text-blue-400 text-xl tracking-tighter whitespace-nowrap">{modalData.matchedTx.amount} <span className="text-[9px] text-slate-500">USDT</span></td></tr>
                    </tbody>
                  </table>
                </div>
              </section>
              <div className="bg-blue-500/5 p-8 rounded-3xl border border-blue-500/20 shadow-inner px-12 text-center">
                <div className="flex items-center justify-center gap-3 mb-4"><CheckCircle2 size={24} className="text-blue-500" /><h4 className="text-lg font-black text-white italic uppercase tracking-tighter underline decoration-blue-500/30 underline-offset-4">AI 審計診斷結論</h4></div>
                <p className="text-sm text-slate-400 leading-relaxed italic max-w-4xl mx-auto">{modalData.description} 該關聯已自動排除店家白名單地址。</p>
              </div>
            </div>
            <div className="p-8 border-t border-slate-800 bg-slate-900/40 flex justify-end px-14"><button onClick={() => setShowModal(false)} className="px-12 py-4 bg-white text-black font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-[10px] tracking-widest shadow-xl">關閉並返回</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- 安全初始化渲染根節點 ---
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
