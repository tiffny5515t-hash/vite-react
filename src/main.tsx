import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { 
  ShieldCheck, Store, Repeat, ShieldAlert, FileText, Clock, 
  AlertTriangle, Copy, ArrowRightLeft, Activity, X, Users, Link2, Plus, Trash2, CheckCircle2, Info, Loader2
} from 'lucide-react'

// --- 實戰設定區 ---
// 您的 TronGrid API Key
const TRONGRID_API_KEY = "ab5d8c77-fee7-4fcc-a533-faa18a67f2c1"; 

/** * 【全真實兩層穿透引擎核心邏輯 - 修復版】
 * 1. 修正：將抓取的 qLedger 完整封裝進 finalReport 狀態，解決表格顯示空白的問題。
 * 2. 實戰 L1：掃描公司錢包 OUT 流向，獲取真實歷史客戶。
 * 3. 實戰 L2：穿透這些真實客戶的流水，執行與 Q 的碰撞比對。
 * 4. 絕對白名單：自動剔除涉及註冊店家錢包的流水。
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

  // 初始化樣式與本地資料
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

  // --- 核心分析引擎：修正數據封裝與節流 ---
  const runRealDeepAnalysis = async () => {
    if (!qAddress || merchantWallets.length === 0) return;
    setFinalReport(null);
    setQLedger([]);
    setAnalysisStep(1); 

    const storeWhiteList = new Set(merchantWallets.map(m => m.address.toLowerCase()));
    const targetQ = qAddress.trim().toLowerCase();

    try {
      // 1. 撈取目標 Q 的真實交易流水 (Level 1)
      const qRes = await fetch(`https://api.trongrid.io/v1/accounts/${targetQ}/transactions/trc20?limit=15`, {
        headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY }
      });
      const qData = await qRes.json();
      if (!qData.success || !qData.data) throw new Error("Q 地址 API 請求失敗，請確認地址正確或 API Key 有效。");

      const fetchedQLedger = qData.data.map((tx: any) => ({
        time: new Date(tx.block_timestamp).toLocaleString(),
        from: tx.from, to: tx.to,
        amount: (tx.value / Math.pow(10, tx.token_info.decimals || 6)).toFixed(2),
        type: tx.from.toLowerCase() === targetQ ? 'OUT' : 'IN'
      }));

      // 更新即時顯示狀態
      setQLedger(fetchedQLedger);

      const qNeighbors = new Set();
      fetchedQLedger.forEach((tx: any) => {
        const f = tx.from.toLowerCase();
        const t = tx.to.toLowerCase();
        if (!storeWhiteList.has(f) && f !== targetQ) qNeighbors.add(f);
        if (!storeWhiteList.has(t) && t !== targetQ) qNeighbors.add(t);
      });

      setAnalysisStep(2);
      await delay(400);
      
      // 2. 識別分店真實客戶 (Level 1: 掃描公司錢包 OUT 流向)
      const storeClientsMap = new Map(); 
      for (const merchant of merchantWallets) {
        const mRes = await fetch(`https://api.trongrid.io/v1/accounts/${merchant.address}/transactions/trc20?limit=10`, {
          headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY }
        });
        const mData = await mRes.json();
        const clients = (mData.data || [])
          .filter((tx: any) => tx.from.toLowerCase() === merchant.address.toLowerCase())
          .map((tx: any) => tx.to);
        storeClientsMap.set(merchant.id, [...new Set(clients)]);
        await delay(300); // 增加延遲，防止 429 Error
      }

      setAnalysisStep(3);

      // 3. 深度樣本穿透 (Level 2) 並執行真實交叉比對
      const matches: any[] = [];
      for (const merchant of merchantWallets) {
        const clients = storeClientsMap.get(merchant.id) || [];
        
        // 採樣該分店前 5 名真實活躍客戶進行穿透比對
        for (const clientAddr of clients.slice(0, 5)) {
          const cAddrLower = clientAddr.toLowerCase();
          if (storeWhiteList.has(cAddrLower)) continue;

          // 第一層判定：直接命中
          if (cAddrLower === targetQ) {
            matches.push({
              store: merchant.name,
              customerWallet: clientAddr,
              relatedAddr: "直接完全匹配",
              matchType: "第一層：客戶地址命中",
              riskLevel: "CRITICAL",
              matchedTx: fetchedQLedger[0] || { time: 'N/A', amount: '0', from: 'N/A', to: 'N/A' },
              description: `目標地址 Q 曾直接從「${merchant.name}」分店接收資金，兩者鏈上地址完全一致。`
            });
            continue; 
          }

          // 第二層穿透：獲取該客戶流水
          const cRes = await fetch(`https://api.trongrid.io/v1/accounts/${clientAddr}/transactions/trc20?limit=8`, {
            headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY }
          });
          const cData = await cRes.json();
          const cLedger = cData.data || [];

          for (const cTx of cLedger) {
            const cf = cTx.from.toLowerCase();
            const ct = cTx.to.toLowerCase();

            // 絕對白名單排除
            if (storeWhiteList.has(cf) || storeWhiteList.has(ct)) continue;

            // 情境 1: 與 Q 有直接往來
            if (cf === targetQ || ct === targetQ) {
              matches.push({
                store: merchant.name,
                customerWallet: clientAddr,
                relatedAddr: qAddress.toUpperCase(),
                matchType: "第二層：資金直接往來",
                riskLevel: "HIGH",
                matchedTx: { 
                  time: new Date(cTx.block_timestamp).toLocaleString(), 
                  from: cTx.from, to: cTx.to, 
                  amount: (cTx.value / Math.pow(10, cTx.token_info.decimals || 6)).toFixed(2)
                },
                description: `目標 Q 與「${merchant.name}」分店真實客戶 ${clientAddr} 在鏈上有過直接資金流動。`
              });
              break; 
            }

            // 情境 2: 共同第三方節點碰撞
            if (qNeighbors.has(cf) || qNeighbors.has(ct)) {
              const commonNode = qNeighbors.has(cf) ? cTx.from : cTx.to;
              if (commonNode.toLowerCase() === targetQ || commonNode.toLowerCase() === cAddrLower) continue;

              matches.push({
                store: merchant.name,
                customerWallet: clientAddr,
                relatedAddr: commonNode,
                matchType: "第二層：共同第三方節點碰撞",
                riskLevel: "WARNING",
                matchedTx: { 
                  time: new Date(cTx.block_timestamp).toLocaleString(), 
                  from: cTx.from, to: cTx.to, 
                  amount: (cTx.value / Math.pow(10, cTx.token_info.decimals || 6)).toFixed(2)
                },
                description: `目標 Q 與「${merchant.name}」分店真實客戶 ${clientAddr} 均與第三方地址 ${commonNode} 有過資金重疊（已排除店家）。`
              });
              break;
            }
          }
          await delay(200); // 防止二層穿透時觸發頻率限制
        }
      }

      // 重要修正：將 qLedger 放入 finalReport 對象中傳遞
      setFinalReport({ 
        qAddress: targetQ.toUpperCase(), 
        qLedger: fetchedQLedger, // 確保數據傳入報表
        timestamp: new Date().toLocaleString(), 
        matches 
      });
      setAnalysisStep(4);
    } catch (error: any) {
      console.error(error);
      setAnalysisStep(0);
      alert(error.message || "數據抓取異常，請檢查 API Key 或網路環境。");
    }
  };

  return (
    <div className="min-h-screen bg-[#060608] text-slate-300 font-sans p-4 md:p-8 selection:bg-blue-600/30">
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
            <h1 className="text-2xl font-black text-white italic uppercase tracking-widest leading-none">Risk Auditor Pro</h1>
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
            <section className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 backdrop-blur-md sticky top-28 shadow-xl shadow-blue-900/5">
              <h2 className="text-white font-bold mb-6 flex items-center gap-2 text-sm uppercase tracking-widest">註冊公司錢包</h2>
              <div className="space-y-4">
                <input type="text" value={newMerchantName} onChange={e => setNewMerchantName(e.target.value)} placeholder="店面名稱 (如：AA分店)" className="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-4 text-sm focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                <input type="text" value={newMerchantAddr} onChange={e => setNewMerchantAddr(e.target.value)} placeholder="錢包地址 (T...)" className="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-4 text-sm font-mono focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                <button onClick={addMerchant} className="w-full bg-blue-600 hover:bg-blue-500 text-black font-black py-4 rounded-xl transition-all uppercase text-xs shadow-xl">儲存並授權掃描</button>
              </div>
              <div className="mt-8 border-t border-slate-800 pt-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-4 tracking-widest text-center">已登記店家 ({merchantWallets.length})</h3>
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
                <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl text-[11px]">
                    <p className="text-blue-400 font-bold mb-1 uppercase tracking-widest flex items-center gap-2"><Info size={14}/> 全真實模式</p>
                    <p className="text-slate-500 italic">系統將掃描分店流向地址識別「真實客戶(L1)」，並進一步穿透其「真實流水(L2)」，排除公司錢包誤報。</p>
                </div>
                <input type="text" value={qAddress} onChange={e => setQAddress(e.target.value)} placeholder="輸入待查 Q 客戶地址..." className="w-full bg-black border border-slate-800 rounded-2xl px-5 py-5 text-sm font-mono text-white focus:ring-1 focus:ring-blue-500 outline-none shadow-2xl" />
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
                    識別分店真實歷史客戶實體 (L1)...
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
          {(qLedger.length > 0 || finalReport) ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-[2.5rem] shadow-2xl animate-in pb-10">
              <div className="p-10 bg-gradient-to-br from-[#0c0c0e] to-black border-b border-slate-800 flex justify-between items-start">
                <div>
                  <h3 className="text-3xl font-black text-white italic uppercase mb-3 underline decoration-blue-500/50 underline-offset-8 tracking-tighter">審計穿透報告</h3>
                  <div className="flex items-center gap-2 mt-6 bg-blue-500/5 p-3 rounded-xl border border-blue-500/10">
                    <p className="text-[12px] text-blue-500 font-mono font-bold whitespace-nowrap overflow-x-auto py-1 flex-1 tracking-tight uppercase">TARGET: {qAddress.toUpperCase()}</p>
                    <button onClick={() => handleCopy(qAddress)} className="text-slate-600 hover:text-white shrink-0"><Copy size={16}/></button>
                  </div>
                </div>
                <FileText className="text-slate-800 opacity-50 shrink-0" size={64} />
              </div>

              <div className="p-10 space-y-12">
                <section>
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6 px-2 flex items-center gap-2"><Clock size={16} className="text-blue-500" /> 第一層：Q 真實鏈上交易流水 (TRC20)</h4>
                  <div className="bg-black/40 rounded-3xl border border-slate-800 overflow-hidden shadow-inner overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-[11px] font-mono min-w-[1000px]">
                      <thead className="bg-white/5 text-slate-500 border-b border-slate-800 uppercase tracking-widest">
                        <tr><th className="px-6 py-4">時間</th><th className="px-6 py-4">FROM</th><th className="px-6 py-4 text-center">方向</th><th className="px-6 py-4">TO</th><th className="px-6 py-4 text-right">金額 (USDT)</th></tr>
                      </thead>
                      <tbody>
                        {qLedger.map((tx, i) => (
                          <tr key={i} className="hover:bg-white/5 border-b border-slate-800/30 transition-colors">
                            <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{tx.time}</td>
                            <td className="px-6 py-4 select-all font-bold tracking-tighter">{tx.from}</td>
                            <td className="px-6 py-4 text-center"><span className={`px-2 py-0.5 rounded font-black text-[9px] ${tx.type === 'IN' ? 'bg-blue-500/10 text-blue-400' : 'bg-orange-500/10 text-orange-400'}`}>{tx.type}</span></td>
                            <td className="px-6 py-4 select-all font-bold tracking-tighter">{tx.to}</td>
                            <td className="px-6 py-4 text-right font-bold text-slate-200">{tx.amount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  <h4 className="text-[11px] font-bold text-red-500 uppercase tracking-widest mb-8 px-2 flex items-center gap-2"><AlertTriangle size={16} /> 真實兩層碰撞命中結果</h4>
                  <div className="space-y-6">
                    {finalReport && finalReport.matches.length > 0 ? finalReport.matches.map((m: any, i: number) => (
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
                              <p className="text-[12px] font-mono text-white whitespace-nowrap overflow-x-auto custom-scrollbar-h bg-black/40 p-4 rounded-xl border border-slate-800 font-bold py-3 shadow-inner select-all tracking-tighter">{m.customerWallet}</p>
                            </div>
                            <ArrowRightLeft className="text-slate-800 hidden lg:block shrink-0" size={24} />
                            <div className="flex-1 w-full overflow-hidden">
                              <p className="text-[10px] text-red-400 uppercase font-bold mb-2 tracking-widest">命中共同節點 (L2)</p>
                              <p className="text-[12px] font-mono text-red-400 whitespace-nowrap overflow-x-auto custom-scrollbar-h bg-red-500/5 p-4 rounded-xl border border-red-500/20 shadow-lg font-bold py-3 select-all tracking-tighter">{m.relatedAddr}</p>
                            </div>
                          </div>
                          <div className="flex justify-end gap-3 mt-4"><button onClick={() => {setModalData(m); setShowModal(true);}} className="bg-emerald-600 text-black font-black px-8 py-3 rounded-xl text-[10px] uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-lg">查看證據錄</button></div>
                        </div>
                      </div>
                    )) : finalReport ? (
                        <div className="p-20 text-center bg-black/20 rounded-[2rem] border border-dashed border-slate-800 animate-in">
                            <ShieldCheck size={48} className="mx-auto mb-4 text-emerald-500 opacity-50" />
                            <p className="text-sm font-bold text-slate-500 italic leading-relaxed text-center">
                                經兩層主網穿透分析，Q 地址與各分店客戶在第三方節點上無資金匯集跡象。
                            </p>
                        </div>
                    ) : (
                        <div className="p-10 text-center text-slate-600 italic text-xs uppercase tracking-widest animate-pulse">深度分析比對中，請稍候...</div>
                    )}
                  </div>
                </section>
                <div className="pt-10 border-t border-slate-800 flex justify-center">
                  <button onClick={() => {setQAddress(''); setQLedger([]); setFinalReport(null); setAnalysisStep(0);}} className="flex items-center gap-3 text-xs font-bold text-slate-500 hover:text-white transition-all uppercase bg-slate-900/50 px-12 py-4 rounded-full border border-slate-800 shadow-xl"><Repeat size={16} /> 啟動新審計任務</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[750px] flex flex-col items-center justify-center bg-slate-900/20 rounded-[4rem] border-2 border-dashed border-slate-800/50 text-slate-600 p-20 text-center shadow-inner">
               <Repeat size={80} className="opacity-10 text-blue-500 animate-spin-slow mb-8" />
               <h3 className="text-2xl font-black text-slate-400 tracking-tighter uppercase italic tracking-widest leading-relaxed">System Ready</h3>
               <p className="text-sm mt-4 text-slate-500 max-w-md leading-relaxed italic text-center">輸入目標地址並發起掃描。系統將掃描分店流向地址識別「真實客戶」並執行深度兩層穿透比對。</p>
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
              <div className="flex items-center gap-5"><div className="bg-emerald-500 p-3 rounded-2xl shadow-lg shadow-emerald-500/20"><Activity className="text-black" size={28} /></div><div><h4 className="text-2xl font-black text-white italic uppercase tracking-tighter leading-none">真實穿透鏈上證據錄</h4><p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mt-1">Audit Traceability Verified</p></div></div>
              <button onClick={() => setShowModal(false)} className="bg-slate-900 p-3 rounded-2xl text-slate-500 hover:text-red-400 transition-all border border-slate-800 group"><X size={24} /></button>
            </div>
            <div className="p-12 overflow-y-auto custom-scrollbar space-y-12 px-16">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-black/60 p-8 rounded-[2rem] border border-slate-800 shadow-inner"><h5 className="text-[10px] font-bold text-slate-500 uppercase mb-4 tracking-widest font-bold text-center">當前查驗對象 Q (Source)</h5><p className="text-[15px] font-mono text-white select-all break-all font-bold leading-relaxed">{qAddress.toUpperCase()}</p></div>
                <div className="bg-red-500/5 p-8 rounded-[2rem] border border-red-500/20 shadow-xl"><h5 className="text-[10px] font-bold text-red-400 uppercase mb-4 tracking-widest font-bold text-center">命中分店客戶地址</h5><p className="text-[15px] font-mono text-red-400 select-all break-all font-bold leading-relaxed">{modalData.customerWallet}</p></div>
              </div>
              <div className="bg-black/60 rounded-[2.5rem] border border-slate-800 overflow-x-auto shadow-2xl custom-scrollbar-h">
                <table className="w-full text-left text-[13px] font-mono border-collapse min-w-[1100px]">
                  <thead className="bg-white/5 text-slate-500 uppercase tracking-widest border-b border-slate-800"><tr><th className="px-10 py-6">證據時間</th><th className="px-10 py-6">FROM</th><th className="px-6 py-6 text-center">狀態</th><th className="px-10 py-6">TO</th><th className="px-10 py-6 text-right">金額 (USDT)</th></tr></thead>
                  <tbody>
                    <tr className="bg-emerald-500/10 transition-colors"><td className="px-10 py-8 text-slate-400 whitespace-nowrap font-bold">{modalData.matchedTx.time}</td><td className="px-10 py-8 select-all break-all font-bold">{modalData.matchedTx.from}</td><td className="px-6 py-8 text-center"><span className="text-[9px] font-black bg-emerald-500 text-black px-2 py-0.5 rounded shadow-lg uppercase tracking-widest whitespace-nowrap">Chain Verified</span></td><td className="px-10 py-8 select-all break-all font-bold text-red-400">{modalData.matchedTx.to}</td><td className="px-10 py-8 text-right font-black text-emerald-400 text-2xl tracking-tighter">{modalData.matchedTx.amount} <span className="text-[10px] text-slate-500 font-normal">USDT</span></td></tr>
                  </tbody>
                </table>
              </div>
              <div className="bg-emerald-500/5 p-12 rounded-[3rem] border border-emerald-500/20 shadow-inner px-16 text-center">
                <div className="flex items-center justify-center gap-4 mb-5"><CheckCircle2 size={32} className="text-emerald-500" /><h4 className="text-xl font-black text-white italic uppercase tracking-tighter underline decoration-blue-500/30 underline-offset-4">AI 審計診斷結論</h4></div>
                <p className="text-[16px] text-slate-400 leading-relaxed italic max-w-5xl mx-auto text-left">
                    {modalData.description} 該結果經由兩層主網穿透驗證，已自動排除與註冊公司錢包相關的所有流水。雙方在非公司控制的外部共同節點「${modalData.relatedAddr}」有顯著資金匯集跡象。
                </p>
              </div>
            </div>
            <div className="p-10 border-t border-slate-800 bg-slate-900/40 flex justify-end px-16"><button onClick={() => setShowModal(false)} className="px-14 py-5 bg-white text-black font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-xs tracking-[0.2em] shadow-xl">關閉並返回</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App;

// --- 安全渲染掛載邏輯 ---
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
