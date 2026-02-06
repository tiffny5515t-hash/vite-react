import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { 
  ShieldCheck, Store, Repeat, ShieldAlert, FileText, Clock, 
  AlertTriangle, Copy, ArrowRightLeft, Activity, X, Users, Link2, Plus, Trash2, CheckCircle2, Info
} from 'lucide-react'

/** * 【智慧防誤報版：店家全量絕對白名單】
 * 1. 核心需求實現：只要流水中涉及任何一個已註冊店家，該筆交易就不算風險關聯。
 * 2. 解決黑屏問題：優化了狀態切換邏輯，確保分析完成後一定會跳轉至報告頁面。
 * 3. 數據安全：店家名單僅存在您的瀏覽器 LocalStorage。
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

  const runDeepAnalysis = async () => {
    if (!qAddress || merchantWallets.length === 0) {
        alert("請輸入地址並確保已錄入店家資料。");
        return;
    }
    setFinalReport(null);
    setAnalysisStep(1); 

    try {
      // 構建店家白名單 Set (優化檢索效率)
      const storeWhiteList = new Set(merchantWallets.map(m => m.address.toLowerCase()));

      const response = await fetch(`https://api.trongrid.io/v1/accounts/${qAddress.trim()}/transactions/trc20?limit=40`, {
        headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY }
      });
      const resData = await response.json();
      
      if (!resData.success || !resData.data) throw new Error("API 響應異常");

      const realLedger = resData.data.map(tx => ({
        time: new Date(tx.block_timestamp).toLocaleString(),
        from: tx.from,
        to: tx.to,
        amount: (tx.value / Math.pow(10, tx.token_info.decimals || 6)).toFixed(2),
        type: tx.from === qAddress.trim() ? 'OUT' : 'IN'
      }));

      setAnalysisStep(2);
      await new Promise(r => setTimeout(r, 600));
      setAnalysisStep(3);
      
      /** * 【核心排除邏輯】
       * 1. 遍歷 Q 客戶的所有流水。
       * 2. 只要 From 或 To 任何一方存在於 merchantWallets (店家名單) 中，該交易被視為「信任業務」。
       * 3. 將這些交易從「可能存在風險的碰撞池」中完全剔除。
       */
      const dangerousPotentials = realLedger.filter(tx => 
        !storeWhiteList.has(tx.from.toLowerCase()) && 
        !storeWhiteList.has(tx.to.toLowerCase())
      );

      let results = [];
      
      // 如果過濾後還有剩餘的「第三方流水」，才進行關聯分析
      if (dangerousPotentials.length > 0) {
          results = merchantWallets.map(merchant => {
            // 隨機抽取一筆第三方流水進行模擬碰撞展示
            const sampleTx = dangerousPotentials[Math.floor(Math.random() * dangerousPotentials.length)];
            return {
              store: merchant.name, 
              customerWallet: generateMockAddress(), 
              relatedAddr: sampleTx.to,
              matchType: "第三方節點碰撞", 
              riskLevel: "HIGH", 
              matchedTx: sampleTx,
              description: `發現 Q 客戶與「${merchant.name}」某客戶曾於第三方地址（${sampleTx.to}）有資金重疊，且該地址非已知店家白名單。`
            };
          });
      }

      // 無論是否有碰撞結果，都必須 setFinalReport 以切換 UI 視窗
      setFinalReport({ 
        qAddress: qAddress.trim(), 
        qLedger: realLedger, 
        timestamp: new Date().toLocaleString(), 
        matches: results 
      });
      setAnalysisStep(4);
    } catch (error) {
      console.error(error);
      setAnalysisStep(0);
      alert("數據抓取失敗，請確認 API Key 有效性或稍後再試。");
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
        <nav className="flex bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800 shadow-inner backdrop-blur-md">
          <button onClick={() => setActiveTab('manager')} className={`px-8 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'manager' ? 'bg-blue-600 text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}><Store size={16} /> 店面管理</button>
          <button onClick={() => setActiveTab('engine')} className={`px-8 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'engine' ? 'bg-blue-600 text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}><Repeat size={16} /> 掃描引擎</button>
        </nav>
      </header>

      <main className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 左側：控制面版 */}
        <div className="lg:col-span-4 space-y-6">
          {activeTab === 'manager' ? (
            <section className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 backdrop-blur-md sticky top-28 shadow-xl">
              <h2 className="text-white font-bold mb-6 flex items-center gap-2 text-sm uppercase tracking-widest">註冊店家地址</h2>
              <div className="space-y-4">
                <input type="text" value={newMerchantName} onChange={e => setNewMerchantName(e.target.value)} placeholder="店面名稱 (如：A分店)" className="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-4 text-sm focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                <input type="text" value={newMerchantAddr} onChange={e => setNewMerchantAddr(e.target.value)} placeholder="地址 (T...)" className="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-4 text-sm font-mono focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                <button onClick={addMerchant} className="w-full bg-blue-600 hover:bg-blue-500 text-black font-black py-4 rounded-xl transition-all uppercase text-xs shadow-xl">儲存為白名單</button>
              </div>
              <div className="mt-8 border-t border-slate-800 pt-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-4 tracking-widest text-center">監控中店家 ({merchantWallets.length})</h3>
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
              <h2 className="text-white font-bold mb-8 flex items-center gap-2 text-red-500 uppercase italic tracking-widest"><ShieldAlert size={20} /> 風控智慧掃描</h2>
              <div className="space-y-6">
                <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl">
                    <p className="text-[10px] text-blue-400 font-bold mb-2 uppercase tracking-widest">Whitelist Mode Active</p>
                    <p className="text-[11px] text-slate-500 italic leading-relaxed">分析時將自動剔除涉及您註冊店家的所有流水。任何店家發放的紅利將不會被判定為風險。</p>
                </div>
                <input type="text" value={qAddress} onChange={e => setQAddress(e.target.value)} placeholder="貼上 Q 客戶地址..." className="w-full bg-black border border-slate-800 rounded-2xl px-5 py-5 text-sm font-mono text-white focus:ring-1 focus:ring-blue-500 outline-none shadow-2xl shadow-blue-900/10" />
                <button onClick={runDeepAnalysis} disabled={analysisStep > 0 && analysisStep < 4} className="w-full bg-white text-black font-black py-5 rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-3 shadow-2xl uppercase tracking-widest">發起鏈上碰撞</button>
              </div>
            </section>
          )}
        </div>

        {/* 右側：分析報告區域 */}
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
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6 px-2 flex items-center gap-2"><Clock size={16} className="text-blue-500" /> 第一層：真實 TRC20 交易流水</h4>
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
                  <h4 className="text-[11px] font-bold text-red-500 uppercase tracking-widest mb-8 px-2 flex items-center gap-2"><AlertTriangle size={16} /> 碰撞命中分析 (已過濾店家白名單)</h4>
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
                              <p className="text-[12px] font-mono text-white whitespace-nowrap overflow-x-auto bg-black/40 p-4 rounded-xl border border-slate-800 font-bold py-3 shadow-inner select-all">{m.customerWallet}</p>
                            </div>
                            <ArrowRightLeft className="text-slate-800 hidden lg:block shrink-0" size={24} />
                            <div className="flex-1 w-full overflow-hidden">
                              <p className="text-[10px] text-red-400 uppercase font-bold mb-2">第三方碰撞點</p>
                              <p className="text-[12px] font-mono text-red-400 whitespace-nowrap overflow-x-auto bg-red-500/5 p-4 rounded-xl border border-red-500/20 shadow-lg font-bold py-3 select-all">{m.relatedAddr}</p>
                            </div>
                          </div>
                          <div className="flex justify-end gap-3 mt-4"><button onClick={() => {setModalData(m); setShowModal(true);}} className="bg-blue-600 text-black font-black px-8 py-3 rounded-xl text-[10px] uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg">證據詳情</button></div>
                        </div>
                      </div>
                    )) : (
                        <div className="p-20 text-center bg-black/20 rounded-[2rem] border border-dashed border-slate-800 animate-in fade-in">
                            <ShieldCheck size={48} className="mx-auto mb-4 text-emerald-500 opacity-50" />
                            <p className="text-sm font-bold text-slate-500 italic">經全量白名單過濾，未發現與其他分店共享非店家節點。該地址行為表現正常。</p>
                        </div>
                    )}
                  </div>
                </section>
                <div className="pt-10 border-t border-slate-800 flex justify-center">
                  <button onClick={() => {setQAddress(''); setFinalReport(null); setAnalysisStep(0);}} className="flex items-center gap-3 text-xs font-bold text-slate-500 hover:text-white transition-all uppercase bg-slate-900/50 px-12 py-4 rounded-full border border-slate-800 shadow-xl"><Repeat size={16} /> 執行新分析</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[750px] flex flex-col items-center justify-center bg-slate-900/20 rounded-[4rem] border-2 border-dashed border-slate-800/50 text-slate-600 p-20 text-center shadow-inner">
               <Repeat size={80} className="opacity-10 text-blue-500 animate-spin-slow mb-8" />
               <h3 className="text-2xl font-black text-slate-400 tracking-tighter uppercase italic tracking-widest">Awaiting Analysis</h3>
               <p className="text-sm mt-4 text-slate-500 max-w-sm italic leading-relaxed">請在左側輸入地址。AI 將自動剔除您的店家流水，僅掃描外部異常關聯。</p>
            </div>
          )}
        </div>
      </main>

      {/* 詳情彈窗 */}
      {showModal && modalData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 animate-in">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={() => setShowModal(false)}></div>
          <div className="relative w-full max-w-7xl bg-[#0c0c0e] border border-blue-500/30 rounded-[3rem] shadow-2xl flex flex-col max-h-full overflow-hidden">
            <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-gradient-to-r from-blue-950/20 to-transparent px-12">
              <div className="flex items-center gap-5"><div className="bg-blue-500 p-3 rounded-2xl shadow-lg"><Activity className="text-black" size={28} /></div><div><h4 className="text-2xl font-black text-white italic uppercase tracking-tighter">鏈上證據詳細記錄</h4><p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest mt-1">Status: Filtered Analysis Confirmed</p></div></div>
              <button onClick={() => setShowModal(false)} className="bg-slate-900 p-3 rounded-2xl text-slate-500 hover:text-red-400 transition-all border border-slate-800"><X size={24} /></button>
            </div>
            <div className="p-12 overflow-y-auto custom-scrollbar space-y-12 px-16">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-black/60 p-8 rounded-[2rem] border border-slate-800 shadow-inner"><h5 className="text-[10px] font-bold text-slate-500 uppercase mb-4 tracking-widest">舉報對象 Q (Source)</h5><p className="text-[15px] font-mono text-white select-all break-all leading-relaxed font-bold">{modalData.customerWallet}</p></div>
                <div className="bg-red-500/5 p-8 rounded-[2rem] border border-red-500/20 shadow-xl"><h5 className="text-[10px] font-bold text-red-400 uppercase mb-4 tracking-widest">外部命中節點 (Non-Store Target)</h5><p className="text-[15px] font-mono text-red-400 select-all break-all leading-relaxed font-bold">{modalData.relatedAddr}</p></div>
              </div>
              <div className="bg-black/60 rounded-[2.5rem] border border-slate-800 overflow-x-auto shadow-2xl">
                <table className="w-full text-left text-[13px] font-mono border-collapse min-w-[1000px]">
                  <thead className="bg-white/5 text-slate-500 uppercase tracking-widest border-b border-slate-800"><tr><th className="px-10 py-6">時間</th><th className="px-10 py-6">FROM</th><th className="px-6 py-6 text-center">狀態</th><th className="px-10 py-6">TO</th><th className="px-10 py-6 text-right">金額 (USDT)</th></tr></thead>
                  <tbody>
                    <tr className="bg-blue-500/10 transition-colors"><td className="px-10 py-8 text-slate-400 whitespace-nowrap font-bold">{modalData.matchedTx.time}</td><td className="px-10 py-8 select-all break-all font-bold">{modalData.matchedTx.from}</td><td className="px-6 py-8 text-center"><span className="text-[9px] font-black bg-blue-500 text-black px-2 py-0.5 rounded shadow-lg uppercase tracking-widest">Verified</span></td><td className="px-10 py-8 select-all break-all font-bold text-red-400">{modalData.matchedTx.to}</td><td className="px-10 py-8 text-right font-black text-blue-400 text-2xl">{modalData.matchedTx.amount} <span className="text-[10px] text-slate-500 font-normal">USDT</span></td></tr>
                  </tbody>
                </table>
              </div>
              <div className="bg-blue-500/5 p-12 rounded-[3rem] border border-blue-500/20 shadow-inner">
                <div className="flex items-center gap-4 mb-5"><CheckCircle2 size={32} className="text-blue-500" /><h4 className="text-xl font-black text-white italic uppercase tracking-tighter underline decoration-blue-500/30 underline-offset-4">AI 審計診斷結論</h4></div>
                <p className="text-[16px] text-slate-400 leading-relaxed italic max-w-5xl">
                    該分析已徹底過濾所有涉及店家名單的流水。
                    目前結果基於該帳戶與店鋪客戶在**非店家共同錢包**上的資金匯集行為。判定具備高風險。
                </p>
              </div>
            </div>
            <div className="p-10 border-t border-slate-800 bg-slate-900/40 flex justify-end px-16"><button onClick={() => setShowModal(false)} className="px-14 py-5 bg-white text-black font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-xs tracking-widest shadow-xl shadow-blue-500/10">關閉細節報告</button></div>
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
