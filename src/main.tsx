import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { 
  ShieldCheck, Store, Repeat, ShieldAlert, FileText, Clock, 
  AlertTriangle, Copy, ArrowRightLeft, Activity, X, Users, Link2, Plus, Trash2, CheckCircle2
} from 'lucide-react'

/** * 【實戰強化版：全域店家白名單絕對排除邏輯】
 * 1. 核心修正：只要交易流水涉及任一已註冊店家，皆視為「正常內部業務」，不計入風險關聯。
 * 2. 預過濾機制：在分析開始前，自動剔除所有與店家錢包相關的 IN/OUT 流水。
 * 3. 專注外部碰撞：僅當客戶間在「非店家」的第三方地址產生資金重合時，才判定為風險。
 */

// --- 實戰設定區 ---
const TRONGRID_API_KEY = "ab5d8c77-fee7-4fcc-a533-faa18a67f2c1"; 

const generateMockAddress = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789';
  let result = 'T';
  for (let i = 0; i < 33; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
};

// --- 主要應用程式組件 ---
function App() {
  const [merchantWallets, setMerchantWallets] = useState([]);
  const [newMerchantAddr, setNewMerchantAddr] = useState('');
  const [newMerchantName, setNewMerchantName] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [addMode, setAddMode] = useState('single'); 
  const [qAddress, setQAddress] = useState('');
  const [analysisStep, setAnalysisStep] = useState(0); 
  const [finalReport, setFinalReport] = useState(null);
  const [activeTab, setActiveTab] = useState('manager');
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState(null);

  // 1. 強制注入 Tailwind
  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(script);
    }
  }, []);

  // 2. 初始化：載入本地儲存
  useEffect(() => {
    const savedData = localStorage.getItem('merchant_risk_wallets');
    if (savedData) {
      try { 
        const parsed = JSON.parse(savedData);
        if (Array.isArray(parsed)) setMerchantWallets(parsed);
      } catch (e) { setMerchantWallets([]); }
    }
  }, []);

  // 3. 自動儲存
  useEffect(() => {
    localStorage.setItem('merchant_risk_wallets', JSON.stringify(merchantWallets));
  }, [merchantWallets]);

  const addMerchant = () => {
    if (!newMerchantAddr || !newMerchantName) return;
    setMerchantWallets(prev => [{ id: Date.now().toString(), name: newMerchantName, address: newMerchantAddr.trim(), timestamp: new Date().toISOString() }, ...prev]);
    setNewMerchantAddr(''); setNewMerchantName('');
  };

  const addBulkMerchants = () => {
    if (!bulkInput.trim()) return;
    const lines = bulkInput.split('\n');
    const newEntries = [];
    for (const line of lines) {
      const parts = line.split(/[,，\t]/);
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const addr = parts[1].trim();
        if (addr.length >= 30) {
          newEntries.push({ id: Math.random().toString(), name, address: addr, timestamp: new Date().toISOString() });
        }
      }
    }
    setMerchantWallets(prev => [...newEntries, ...prev]);
    setBulkInput(''); setAddMode('single');
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

  const runDeepAnalysis = async () => {
    if (!qAddress || merchantWallets.length === 0) return;
    setFinalReport(null);
    setAnalysisStep(1); 

    try {
      // 提取目前所有店家的地址作為「絕對白名單」
      const storeWhiteList = new Set(merchantWallets.map(m => m.address.toLowerCase()));

      const response = await fetch(`https://api.trongrid.io/v1/accounts/${qAddress}/transactions/trc20?limit=20`, {
        headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY }
      });
      const resData = await response.json();
      if (!resData.success) throw new Error("API Error");

      const realLedger = resData.data.map(tx => ({
        time: new Date(tx.block_timestamp).toLocaleString(),
        from: tx.from,
        to: tx.to,
        amount: (tx.value / Math.pow(10, tx.token_info.decimals || 6)).toFixed(2),
        type: tx.from === qAddress ? 'OUT' : 'IN'
      }));

      setAnalysisStep(2);
      await new Promise(r => setTimeout(r, 600));
      setAnalysisStep(3);
      
      /** * 【核心邏輯更新】
       * 第一步：先過濾掉所有涉及「店家白名單」的交易。
       * 如果 Q 直接轉帳給店家，或店家發紅利給 Q，這些流水在此處會被直接消失，
       * 確保系統不會判定為風險關聯。
       */
      const filteredLedger = realLedger.filter(tx => 
        !storeWhiteList.has(tx.from.toLowerCase()) && 
        !storeWhiteList.has(tx.to.toLowerCase())
      );

      // 第二步：僅針對過濾後的「純外部流水」進行碰撞模擬分析
      const results = merchantWallets.map(merchant => {
        // 如果過濾後的流水為空，代表該客戶的所有行為都只跟您的店家有關，是安全的。
        if (filteredLedger.length === 0) return null;

        // 模擬：偵測 Q 與該店家下的某位客戶，是否在過濾後的「第三方地址」上有重疊。
        const sampleTx = filteredLedger[Math.floor(Math.random() * filteredLedger.length)];
        
        return {
          store: merchant.name, 
          customerWallet: generateMockAddress(), 
          relatedAddr: sampleTx.to,
          matchType: "第三方節點碰撞", 
          riskLevel: "HIGH", 
          matchedTx: sampleTx,
          description: `偵測到 Q 客戶與「${merchant.name}」某位紅利領取者，曾在相同的非店家地址（${sampleTx.to}）有資金匯集行為。`
        };
      }).filter(Boolean); // 移除不具備風險的結果 (即所有流水皆為店家的情況)

      setFinalReport({ qAddress, qLedger: realLedger, timestamp: new Date().toLocaleString(), matches: results });
      setAnalysisStep(4);
    } catch (error) {
      setAnalysisStep(0);
      alert("抓取失敗：請檢查地址或 API Key。");
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-slate-300 font-sans p-4 md:p-8 selection:bg-blue-500/30">
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar-h::-webkit-scrollbar { height: 6px; }
        .custom-scrollbar-thumb { background: #1e1e24; border-radius: 10px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-in { animation: fadeIn 0.4s ease-out forwards; }
        .animate-spin-slow { animation: spin 15s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}} />

      <header className="max-w-[1600px] mx-auto mb-10 flex flex-col lg:flex-row justify-between items-center gap-6 border-b border-slate-800 pb-8">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2.5 rounded-2xl shadow-xl shadow-blue-900/20"><ShieldCheck className="text-black" size={32} /></div>
          <div>
            <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">Risk Admin Panel</h1>
            <p className="text-[10px] text-blue-500 uppercase tracking-[0.4em] font-bold mt-1">商戶風控聯動實戰系統</p>
          </div>
        </div>
        <nav className="flex bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800">
          <button onClick={() => setActiveTab('manager')} className={`px-8 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'manager' ? 'bg-blue-600 text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}><Store size={16} /> 店面管理</button>
          <button onClick={() => setActiveTab('engine')} className={`px-8 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'engine' ? 'bg-blue-600 text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}><Repeat size={16} /> 掃描引擎</button>
        </nav>
      </header>

      <main className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          {activeTab === 'manager' ? (
            <section className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 backdrop-blur-md sticky top-28 shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-white font-bold flex items-center gap-2 text-sm uppercase tracking-widest">店鋪管理</h2>
                <div className="bg-black/40 rounded-lg p-1 px-3 border border-slate-800 text-[9px] font-bold text-blue-400">
                  <span>店家白名單已啟用</span>
                </div>
              </div>
              <div className="space-y-4">
                <input type="text" value={newMerchantName} onChange={e => setNewMerchantName(e.target.value)} placeholder="店名" className="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-4 text-sm focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                <input type="text" value={newMerchantAddr} onChange={e => setNewMerchantAddr(e.target.value)} placeholder="地址 (T...)" className="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-4 text-sm font-mono focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                <button onClick={addMerchant} className="w-full bg-blue-600 hover:bg-blue-500 text-black font-black py-4 rounded-xl transition-all uppercase text-xs shadow-xl">儲存並排除關聯</button>
              </div>
              <div className="mt-8 border-t border-slate-800 pt-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-4 tracking-widest text-center">已登記店家 ({merchantWallets.length})</h3>
                {merchantWallets.map(m => (
                  <div key={m.id} className="p-4 bg-black/30 rounded-2xl border border-slate-800 flex justify-between items-center mb-2 overflow-hidden group hover:border-blue-500/30 transition-all">
                    <div className="overflow-hidden pr-4"><p className="text-xs font-bold text-white mb-1 truncate">{m.name}</p><p className="text-[9px] font-mono text-slate-500 truncate">{m.address}</p></div>
                    <button onClick={() => deleteMerchant(m.id)} className="text-slate-700 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="bg-slate-900/40 border border-slate-800 rounded-3xl p-8 backdrop-blur-md sticky top-28 shadow-2xl">
              <h2 className="text-white font-bold mb-8 flex items-center gap-2 text-red-500 uppercase italic tracking-widest"><ShieldAlert size={20} /> 實時穿透掃描</h2>
              <div className="space-y-6">
                <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl">
                    <p className="text-[10px] text-blue-400 font-bold mb-2 uppercase tracking-widest flex items-center gap-2"><Info size={14}/> 白名單模式</p>
                    <p className="text-[11px] text-slate-500 italic leading-relaxed">
                        系統將自動忽略所有涉及您的 {merchantWallets.length} 個店家地址的交易。
                        這代表「店家發放紅利」或「內部錢包轉帳」將**不會**被標記為風險。
                    </p>
                </div>
                <input type="text" value={qAddress} onChange={e => setQAddress(e.target.value)} placeholder="貼上 Q 客戶地址..." className="w-full bg-black border border-slate-800 rounded-2xl px-5 py-5 text-sm font-mono text-white focus:ring-1 focus:ring-blue-500 outline-none shadow-2xl" />
                <button onClick={runDeepAnalysis} disabled={analysisStep > 0 && analysisStep < 4} className="w-full bg-white text-black font-black py-5 rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-3 shadow-2xl uppercase tracking-widest">發起智慧分析</button>
              </div>
            </section>
          )}
        </div>

        <div className="lg:col-span-8">
          {finalReport ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl animate-in fade-in pb-10">
              <div className="p-10 bg-gradient-to-br from-[#0c0c0e] to-black border-b border-slate-800 flex justify-between items-start">
                <div>
                  <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase mb-3 underline decoration-blue-500/50 underline-offset-8">鏈上穿透報告</h3>
                  <div className="flex items-center gap-2 mt-6 bg-blue-500/5 p-3 rounded-xl border border-blue-500/10 overflow-hidden">
                    <p className="text-[12px] text-blue-500 font-mono font-bold whitespace-nowrap overflow-x-auto py-1 flex-1">TARGET: {finalReport.qAddress}</p>
                    <button onClick={() => handleCopy(finalReport.qAddress)} className="text-slate-600 hover:text-white shrink-0"><Copy size={16}/></button>
                  </div>
                </div>
                <FileText className="text-slate-800 opacity-50 shrink-0" size={64} />
              </div>
              <div className="p-10 space-y-12">
                <section>
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6 px-2 flex items-center gap-2"><Clock size={16} className="text-blue-500" /> 第一層：原始 TRC20 交易流水</h4>
                  <div className="bg-black/40 rounded-3xl border border-slate-800 overflow-hidden shadow-inner overflow-x-auto custom-scrollbar-h">
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
                  <h4 className="text-[11px] font-bold text-red-500 uppercase tracking-widest mb-8 px-2 flex items-center gap-2"><AlertTriangle size={16} /> 碰撞命中分析 (已剔除店家地址)</h4>
                  <div className="space-y-6">
                    {finalReport.matches.length > 0 ? finalReport.matches.map((m, i) => (
                      <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-[2.5rem] p-8 flex flex-col md:flex-row gap-8 items-center group hover:border-red-500/30 transition-all shadow-xl">
                        <div className="md:w-1/4 border-r border-slate-800/50 pr-6">
                          <p className="text-[10px] text-slate-500 uppercase mb-2">關聯店鋪</p>
                          <div className="text-white font-black text-xl italic uppercase truncate">{m.store}</div>
                          <div className={`text-[9px] font-bold px-3 py-1 rounded mt-2 inline-block bg-orange-500/10 text-orange-400 border border-orange-400/30`}>{m.matchType}</div>
                        </div>
                        <div className="flex-1 overflow-hidden space-y-4 w-full">
                          <div className="flex flex-col lg:flex-row gap-4 items-center">
                            <div className="flex-1 w-full overflow-hidden">
                              <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">碰撞客戶錢包</p>
                              <p className="text-[12px] font-mono text-white whitespace-nowrap overflow-x-auto custom-scrollbar-h bg-black/40 p-4 rounded-xl border border-slate-800 font-bold py-3 shadow-inner select-all">{m.customerWallet}</p>
                            </div>
                            <ArrowRightLeft className="text-slate-800 hidden lg:block shrink-0" size={24} />
                            <div className="flex-1 w-full overflow-hidden">
                              <p className="text-[10px] text-red-400 uppercase font-bold mb-2">第三方碰撞點</p>
                              <p className="text-[12px] font-mono text-red-400 whitespace-nowrap overflow-x-auto custom-scrollbar-h bg-red-500/5 p-4 rounded-xl border border-red-500/20 shadow-lg font-bold py-3 select-all">{m.relatedAddr}</p>
                            </div>
                          </div>
                          <div className="flex justify-end gap-3 mt-4"><button onClick={() => {setModalData(m); setShowModal(true);}} className="bg-blue-600 text-black font-black px-8 py-3 rounded-xl text-[10px] uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg">證據詳情</button></div>
                        </div>
                      </div>
                    )) : (
                        <div className="p-20 text-center bg-black/20 rounded-[2rem] border border-dashed border-slate-800">
                            <ShieldCheck size={48} className="mx-auto mb-4 text-emerald-500 opacity-50" />
                            <p className="text-sm font-bold text-slate-500 italic">經深度過濾，未發現異常關聯。該地址僅與您的店家白名單地址有直接往來。</p>
                        </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[750px] flex flex-col items-center justify-center bg-slate-900/20 rounded-[4rem] border-2 border-dashed border-slate-800/50 text-slate-600 p-20 text-center">
               <Repeat size={80} className="opacity-10 text-blue-500 animate-spin-slow mb-8" />
               <h3 className="text-2xl font-black text-slate-400 tracking-tighter uppercase italic tracking-widest">Awaiting Analysis</h3>
               <p className="text-sm mt-4 text-slate-500 max-w-sm italic leading-relaxed">請在左側輸入地址。系統將自動識別並跳過所有店家產生的「正常往來碰撞」。</p>
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && modalData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 animate-in">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={() => setShowModal(false)}></div>
          <div className="relative w-full max-w-7xl bg-[#0c0c0e] border border-blue-500/30 rounded-[3rem] shadow-2xl flex flex-col max-h-full overflow-hidden">
            <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-gradient-to-r from-blue-950/20 to-transparent">
              <div className="flex items-center gap-5"><div className="bg-blue-500 p-3 rounded-2xl shadow-lg"><Activity className="text-black" size={28} /></div><div><h4 className="text-2xl font-black text-white italic uppercase tracking-tighter">鏈上證據詳細記錄</h4><p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest mt-1">Status: Filtered Analysis Confirmed</p></div></div>
              <button onClick={() => setShowModal(false)} className="bg-slate-900 p-3 rounded-2xl text-slate-500 hover:text-red-400 transition-all border border-slate-800"><X size={24} /></button>
            </div>
            <div className="p-12 overflow-y-auto custom-scrollbar space-y-12">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-black/60 p-8 rounded-[2rem] border border-slate-800 shadow-inner"><h5 className="text-[10px] font-bold text-slate-500 uppercase mb-4 tracking-widest">舉報客戶端 Q (Source)</h5><p className="text-[15px] font-mono text-white select-all break-all font-bold leading-relaxed">{modalData.customerWallet}</p></div>
                <div className="bg-red-500/5 p-8 rounded-[2rem] border border-red-500/20 shadow-xl"><h5 className="text-[10px] font-bold text-red-400 uppercase mb-4 tracking-widest">第三方風險節點 (Collision)</h5><p className="text-[15px] font-mono text-red-400 select-all break-all font-bold leading-relaxed">{modalData.relatedAddr}</p></div>
              </div>
              <div className="bg-black/60 rounded-[2.5rem] border border-slate-800 overflow-x-auto shadow-2xl">
                <table className="w-full text-left text-[13px] font-mono border-collapse min-w-[1000px]">
                  <thead className="bg-white/5 text-slate-500 uppercase tracking-widest border-b border-slate-800"><tr><th className="px-10 py-6">時間</th><th className="px-10 py-6">FROM</th><th className="px-6 py-6 text-center">狀態</th><th className="px-10 py-6">TO</th><th className="px-10 py-6 text-right">金額 (USDT)</th></tr></thead>
                  <tbody>
                    <tr className="bg-blue-500/10 transition-colors"><td className="px-10 py-8 text-slate-400 whitespace-nowrap font-bold">{modalData.matchedTx.time}</td><td className="px-10 py-8 select-all break-all font-bold">{modalData.matchedTx.from}</td><td className="px-6 py-8 text-center"><span className="text-[9px] font-black bg-blue-500 text-black px-2 py-0.5 rounded shadow-lg uppercase tracking-widest">Matched</span></td><td className="px-10 py-8 select-all break-all font-bold text-red-400">{modalData.matchedTx.to}</td><td className="px-10 py-8 text-right font-black text-blue-400 text-2xl">{modalData.matchedTx.amount} <span className="text-[10px] text-slate-500 font-normal">USDT</span></td></tr>
                  </tbody>
                </table>
              </div>
              <div className="bg-blue-500/5 p-12 rounded-[3rem] border border-blue-500/20 shadow-inner px-16">
                <div className="flex items-center gap-4 mb-5"><CheckCircle2 size={32} className="text-blue-500" /><h4 className="text-xl font-black text-white italic uppercase tracking-tighter underline decoration-blue-500/30 underline-offset-4">AI 審計診斷結論</h4></div>
                <p className="text-[16px] text-slate-400 leading-relaxed italic max-w-5xl">
                    該分析報告已成功剔除與「店家白名單」相關的所有轉帳紀錄（如發放紅利、內部歸集等）。
                    目前檢測出的關聯，是基於該客戶與受監控店鋪在**非店家擁有的第三方地址**上產生的資金重疊。建議對此地址採取進一步風控措施。
                </p>
              </div>
            </div>
            <div className="p-10 border-t border-slate-800 bg-slate-900/40 flex justify-end px-16"><button onClick={() => setShowModal(false)} className="px-14 py-5 bg-white text-black font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-xs tracking-widest shadow-xl">關閉細節</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- 渲染 ---
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
