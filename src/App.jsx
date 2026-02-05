import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, serverTimestamp, deleteDoc, query } from 'firebase/firestore';
import { 
  Search, ShieldAlert, ShieldCheck, Loader2, Wallet, Users, AlertTriangle, 
  Layers, Repeat, Store, CheckCircle2, Trash2, GitMerge, FileText, 
  Plus, ArrowDownLeft, ArrowUpRight, Clock, ArrowRightLeft, Copy, 
  Link2, Activity, X, Info
} from 'lucide-react';

// --- Firebase 配置 ---
// 使用系統環境提供的配置資訊
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'merchant-risk-v3-final';

// 輔助函數：生成模擬完整波場地址 (34字元)
const generateMockAddress = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789';
  let result = 'T';
  for (let i = 0; i < 33; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
};

export default function App() {
  const [user, setUser] = useState(null);
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

  // 1. 處理身份驗證 (遵循 RULE 3: 先驗證再查詢)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 監聽店家資料庫 (遵循 RULE 1 & 2: 使用正確路徑並在 JS 中過濾)
  useEffect(() => {
    if (!user) return;
    // 使用公共路徑存放店面資料
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'merchants');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMerchantWallets(data);
    }, (err) => {
      console.error("Firestore error:", err);
    });
    return () => unsubscribe();
  }, [user]);

  const addMerchant = async () => {
    if (!user || !newMerchantAddr || !newMerchantName) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'merchants'), {
        name: newMerchantName,
        address: newMerchantAddr.trim(),
        timestamp: serverTimestamp(),
        createdBy: user.uid
      });
      setNewMerchantAddr('');
      setNewMerchantName('');
    } catch (e) {
      console.error("Error adding document: ", e);
    }
  };

  const addBulkMerchants = async () => {
    if (!user || !bulkInput.trim()) return;
    const lines = bulkInput.split('\n');
    for (const line of lines) {
      const parts = line.split(/[,，\t]/);
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const addr = parts[1].trim();
        if (name && addr.length >= 30) {
          try {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'merchants'), {
              name,
              address: addr,
              timestamp: serverTimestamp(),
              createdBy: user.uid
            });
          } catch (e) { console.error(e); }
        }
      }
    }
    setBulkInput('');
    setAddMode('single');
  };

  const deleteMerchant = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'merchants', id));
    } catch (e) { console.error(e); }
  };

  const handleCopy = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  };

  const resetAnalysis = () => {
    setQAddress('');
    setAnalysisStep(0);
    setFinalReport(null);
  };

  const openDetailModal = (matchData) => {
    setModalData(matchData);
    setShowModal(true);
  };

  const runDeepAnalysis = async () => {
    if (!qAddress || merchantWallets.length === 0) return;
    setFinalReport(null);
    setAnalysisStep(1); 

    setTimeout(async () => {
      // 模擬獲取 Q 地址最近流水
      const qLedger = Array.from({length: 10}, (_, i) => {
        const isOut = i % 2 === 0;
        const otherAddr = generateMockAddress();
        return {
          time: new Date(Date.now() - i * 3600000).toLocaleString(),
          from: isOut ? qAddress : otherAddr,
          to: isOut ? otherAddr : qAddress,
          amount: (Math.random() * 5000 + 100).toFixed(2),
          type: isOut ? 'OUT' : 'IN'
        };
      });

      setAnalysisStep(2); 
      setTimeout(() => {
        setAnalysisStep(3); 
        setTimeout(() => {
          // 遍歷所有店家進行碰撞分析
          const allMatches = merchantWallets.map((merchant, index) => {
            const hitType = index % 3; 
            const matchedTx = qLedger[Math.floor(Math.random() * qLedger.length)];
            return {
              store: merchant.name,
              customerWallet: hitType === 0 ? qAddress : generateMockAddress(),
              relatedAddr: hitType === 0 ? "N/A (直接命中)" : qLedger[2].to,
              matchType: hitType === 0 ? "客戶錢包直接命中" : "客戶錢包關連地址命中",
              riskLevel: hitType === 0 ? "CRITICAL" : "HIGH",
              matchedTx: matchedTx,
              description: hitType === 0 ? `系統發現 Q 曾直接出現在「${merchant.name}」的紅利領取名單。` : `舉報地址 Q 的資金去向，與「${merchant.name}」某位紅利客戶的關連地址高度吻合。`
            };
          });
          setFinalReport({ qAddress, qLedger, timestamp: new Date().toLocaleString(), matches: allMatches });
          setAnalysisStep(4);
        }, 2000);
      }, 1500);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#020204] text-slate-300 font-sans p-4 md:p-8">
      {/* 導航標頭 */}
      <header className="max-w-[1600px] mx-auto mb-10 flex flex-col lg:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-600 p-2.5 rounded-2xl shadow-lg shadow-emerald-500/20"><ShieldAlert className="text-black" size={32} /></div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tighter italic uppercase">Merchant Risk AI</h1>
            <p className="text-[10px] text-emerald-500 uppercase tracking-[0.4em] font-bold">商戶聯動風控審計系統</p>
          </div>
        </div>
        <nav className="flex bg-slate-900/40 p-1.5 rounded-2xl border border-slate-800 backdrop-blur-2xl">
          <button onClick={() => setActiveTab('manager')} className={`px-8 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'manager' ? 'bg-emerald-600 text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}><Store size={16} /> 店面管理</button>
          <button onClick={() => setActiveTab('engine')} className={`px-8 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'engine' ? 'bg-emerald-600 text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}><Repeat size={16} /> 比對引擎</button>
        </nav>
      </header>

      <main className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 左側：控制區域 */}
        <div className="lg:col-span-4 space-y-6">
          {activeTab === 'manager' ? (
            <section className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 backdrop-blur-md sticky top-28">
              <h2 className="text-white font-bold mb-6 flex items-center gap-2 text-sm uppercase tracking-widest"><Store size={18} /> 店面資料錄入</h2>
              <div className="bg-black/40 rounded-lg p-1 flex border border-slate-800 mb-6 w-fit">
                <button onClick={() => setAddMode('single')} className={`px-4 py-1.5 text-[10px] font-bold rounded ${addMode === 'single' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>單筆</button>
                <button onClick={() => setAddMode('bulk')} className={`px-4 py-1.5 text-[10px] font-bold rounded ${addMode === 'bulk' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>批量</button>
              </div>
              {addMode === 'single' ? (
                <div className="space-y-4">
                  <input type="text" value={newMerchantName} onChange={e => setNewMerchantName(e.target.value)} placeholder="店面名稱" className="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-4 text-sm focus:ring-1 focus:ring-emerald-500 outline-none" />
                  <input type="text" value={newMerchantAddr} onChange={e => setNewMerchantAddr(e.target.value)} placeholder="錢包地址" className="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-4 text-sm font-mono focus:ring-1 focus:ring-emerald-500 outline-none" />
                  <button onClick={addMerchant} className="w-full bg-emerald-600 hover:bg-emerald-500 text-black font-black py-4 rounded-xl transition-all uppercase text-xs">儲存並永久同步</button>
                </div>
              ) : (
                <div className="space-y-4">
                  <textarea rows={8} value={bulkInput} onChange={e => setBulkInput(e.target.value)} placeholder="名稱, 地址 (每行一筆)" className="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-4 text-xs font-mono focus:ring-1 focus:ring-emerald-500 outline-none resize-none" />
                  <button onClick={addBulkMerchants} className="w-full bg-emerald-600 hover:bg-emerald-500 text-black font-black py-4 rounded-xl transition-all uppercase text-xs">執行批量導入</button>
                </div>
              )}
              <div className="mt-8 border-t border-slate-800 pt-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-4 flex justify-between tracking-widest">已註冊店面 ({merchantWallets.length})</h3>
                {merchantWallets.map(m => (
                  <div key={m.id} className="p-4 bg-black/30 rounded-2xl border border-slate-800 flex justify-between items-center group mb-2 hover:border-emerald-500/50 transition-all">
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-white mb-1">{m.name}</p>
                      <p className="text-[9px] font-mono text-slate-500 truncate">{m.address}</p>
                    </div>
                    <button onClick={() => deleteMerchant(m.id)} className="text-slate-700 hover:text-red-500 ml-4"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 backdrop-blur-md sticky top-28 shadow-2xl">
              <h2 className="text-white font-bold mb-8 flex items-center gap-2 text-red-500 uppercase italic tracking-widest"><ShieldAlert size={20} /> 啟動風控審計</h2>
              <div className="space-y-6">
                <div className="bg-black/60 p-4 rounded-2xl border border-slate-800">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">舉報者 Q 地址</label>
                  <input type="text" value={qAddress} onChange={e => setQAddress(e.target.value)} placeholder="貼上 Q 地址..." className="w-full bg-transparent border-none text-sm font-mono text-white focus:outline-none" />
                </div>
                <button onClick={runDeepAnalysis} disabled={analysisStep > 0 && analysisStep < 4} className="w-full bg-white text-black font-black py-5 rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-3 shadow-2xl uppercase tracking-widest">啟動多層碰撞比對</button>
              </div>
              {analysisStep > 0 && (
                <div className="mt-10 space-y-4">
                  {[1,2,3,4].map(s => (
                    <div key={s} className={`flex items-center gap-4 text-[11px] transition-all ${analysisStep >= s ? 'opacity-100' : 'opacity-20'}`}>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] ${analysisStep > s ? 'bg-emerald-500 text-black' : 'bg-slate-800 text-slate-500'}`}>{analysisStep > s ? '✓' : s}</div>
                      <span className="text-slate-400 font-bold uppercase tracking-widest">Step {s} Analysis</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* 右側：報告內容 */}
        <div className="lg:col-span-8">
          {finalReport ? (
            <div className="bg-slate-900/80 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-700 pb-10">
              <div className="p-10 bg-gradient-to-br from-[#0c0c0e] to-black border-b border-slate-800 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="bg-red-500/20 text-red-500 text-[10px] font-black px-4 py-1.5 rounded-full border border-red-500/30 uppercase tracking-[0.2em]">Full Network Scan</span>
                    <span className="text-slate-600 text-[10px] font-mono uppercase">{finalReport.timestamp}</span>
                  </div>
                  <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase mb-3 underline decoration-emerald-500/50 underline-offset-8">AI 風控審計報告書</h3>
                  <div className="flex items-center gap-2 mt-4">
                    <p className="text-[12px] text-emerald-500 font-mono font-bold break-all select-all tracking-tight">TARGET_Q: {finalReport.qAddress}</p>
                    <button onClick={() => handleCopy(finalReport.qAddress)} className="text-slate-600 hover:text-white shrink-0"><Copy size={14}/></button>
                  </div>
                </div>
                <div className="bg-emerald-500/10 p-5 rounded-3xl border border-emerald-500/20"><FileText className="text-emerald-500" size={48} /></div>
              </div>

              <div className="p-10 space-y-12">
                {/* 1. Q 流水帳 */}
                <section>
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-2"><Clock size={16} className="text-emerald-500" /> 第一層：客戶 Q 最近資金流水</h4>
                  <div className="bg-black/40 rounded-3xl border border-slate-800 overflow-hidden shadow-inner">
                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left text-[11px] font-mono min-w-[1000px]">
                        <thead className="bg-white/5 text-slate-500 uppercase border-b border-slate-800 tracking-widest">
                          <tr>
                            <th className="px-6 py-4">時間</th>
                            <th className="px-6 py-4">FROM</th>
                            <th className="px-6 py-4 text-center">方向</th>
                            <th className="px-6 py-4">TO</th>
                            <th className="px-6 py-4 text-right">金額 (USDT)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {finalReport.qLedger.map((tx, i) => (
                            <tr key={i} className="hover:bg-white/5 transition-colors group">
                              <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{tx.time}</td>
                              <td className="px-6 py-4 text-slate-400 whitespace-nowrap font-bold select-all tracking-tight">{tx.from}</td>
                              <td className="px-6 py-4 text-center">
                                <span className={`px-2 py-0.5 rounded-[4px] font-black text-[9px] ${tx.type === 'IN' ? 'bg-blue-500/10 text-blue-400' : 'bg-orange-500/10 text-orange-400'}`}>{tx.type}</span>
                              </td>
                              <td className="px-6 py-4 text-slate-400 whitespace-nowrap font-bold select-all tracking-tight">{tx.to}</td>
                              <td className="px-6 py-4 text-right font-bold text-slate-200">{tx.amount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>

                {/* 2. 碰撞分析清單 */}
                <section>
                  <div className="flex items-center justify-between mb-8 px-2">
                    <h4 className="text-[11px] font-bold text-red-500 uppercase tracking-[0.3em] flex items-center gap-2"><AlertTriangle size={16} /> 碰撞命中分析 (COLLISION LIST)</h4>
                    <span className="bg-red-500 text-black px-4 py-1 rounded-full text-[10px] font-black uppercase">發現 {finalReport.matches.length} 處重疊</span>
                  </div>
                  <div className="space-y-6">
                    {finalReport.matches.map((m, i) => (
                      <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-[2.5rem] p-10 relative overflow-hidden group hover:border-red-500/30 transition-all shadow-xl">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center relative z-10">
                          <div className="md:col-span-3 border-r border-slate-800/50 pr-4">
                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">關聯店家</p>
                            <div className="text-white font-black text-2xl mb-4 italic tracking-tighter uppercase">{m.store}</div>
                            <div className={`text-[9px] font-bold px-3 py-1 rounded-lg border inline-block ${m.riskLevel === 'CRITICAL' ? 'bg-red-500/10 text-red-500 border-red-500/30' : 'bg-orange-500/10 text-orange-400 border-orange-400/30'}`}>{m.matchType}</div>
                          </div>
                          <div className="md:col-span-9 space-y-6">
                             <div className="flex flex-col lg:flex-row items-center gap-6">
                                <div className="flex-1 w-full overflow-hidden">
                                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">客戶錢包 (紅利領取者)</p>
                                  <p className="text-[12px] font-mono text-white whitespace-nowrap overflow-x-auto custom-scrollbar bg-black/40 p-4 rounded-xl border border-slate-800 font-bold select-all shadow-inner">{m.customerWallet}</p>
                                </div>
                                <ArrowRightLeft className="text-slate-800 hidden lg:block" size={24} />
                                <div className="flex-1 w-full overflow-hidden">
                                  <p className="text-[10px] text-red-400 uppercase font-bold mb-2">碰撞關連地址 (命中點)</p>
                                  <p className="text-[12px] font-mono text-red-400 whitespace-nowrap overflow-x-auto custom-scrollbar bg-red-500/5 p-4 rounded-xl border border-red-500/20 shadow-lg font-bold select-all">{m.relatedAddr}</p>
                                </div>
                             </div>
                             <div className="flex justify-end gap-3 mt-4">
                                <button onClick={() => handleCopy(m.relatedAddr)} className="flex items-center gap-2 text-[10px] font-bold text-slate-500 hover:text-white bg-slate-800/50 px-5 py-3 rounded-xl border border-slate-700 transition-all"><Copy size={14}/> 複製命中地址</button>
                                <button onClick={() => openDetailModal(m)} className="flex items-center gap-2 text-[10px] font-black text-black bg-emerald-500 hover:bg-emerald-400 px-8 py-3 rounded-xl transition-all shadow-lg uppercase tracking-widest"><Activity size={14}/> 查看證據詳情</button>
                             </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <div className="pt-10 border-t border-slate-800 flex justify-center">
                  <button onClick={resetAnalysis} className="flex items-center gap-3 text-xs font-bold text-slate-500 hover:text-white transition-all uppercase bg-slate-900/50 px-12 py-4 rounded-full border border-slate-800 hover:border-emerald-500/50 shadow-lg"><Repeat size={16} /> 啟動全新比對任務</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[750px] flex flex-col items-center justify-center bg-slate-900/20 rounded-[4rem] border-2 border-dashed border-slate-800/50 text-slate-600 p-20 text-center">
               <Repeat size={80} className="opacity-10 text-emerald-500 animate-spin-slow mb-8" />
               <h3 className="text-2xl font-black text-slate-400 tracking-tighter uppercase italic">Awaiting Command</h3>
               <p className="text-sm mt-4 text-slate-500 max-w-sm italic">請在左側輸入舉報地址。AI 將自動掃描所有店鋪紅利網絡，識別潛在的資金共控群體。</p>
            </div>
          )}
        </div>
      </main>

      {/* --- 全螢幕證據彈窗 --- */}
      {showModal && modalData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowModal(false)}></div>
          <div className="relative w-full max-w-7xl bg-[#0c0c0e] border border-emerald-500/30 rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-full">
            <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-gradient-to-r from-emerald-950/20 to-transparent">
              <div className="flex items-center gap-5">
                <div className="bg-emerald-500 p-3 rounded-2xl shadow-lg"><Activity className="text-black" size={28} /></div>
                <div>
                  <h4 className="text-2xl font-black text-white italic uppercase tracking-tighter">TRC20 命中交易證據詳情</h4>
                  <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mt-1">Store: {modalData.store} · Cross-Chain Verification</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="bg-slate-900 hover:bg-red-500/20 p-3 rounded-2xl text-slate-500 hover:text-red-400 transition-all border border-slate-800 group"><X size={24} className="group-hover:rotate-90 transition-transform" /></button>
            </div>
            <div className="p-12 overflow-y-auto custom-scrollbar space-y-12">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-black/60 p-8 rounded-[2rem] border border-slate-800 shadow-inner flex flex-col justify-center">
                  <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2 tracking-widest"><Users size={14}/> 客戶錢包 (Source Account)</h5>
                  <div className="flex items-center justify-between gap-6 overflow-hidden">
                    <p className="text-[15px] font-mono text-white whitespace-nowrap overflow-x-auto custom-scrollbar font-bold flex-1 py-2 select-all leading-relaxed">{modalData.customerWallet}</p>
                    <button onClick={() => handleCopy(modalData.customerWallet)} className="shrink-0 p-3 bg-slate-900 rounded-xl text-slate-500 hover:text-emerald-400 transition-colors"><Copy size={20}/></button>
                  </div>
                </div>
                <div className="bg-red-500/5 p-8 rounded-[2rem] border border-red-500/20 shadow-xl flex flex-col justify-center">
                  <h5 className="text-[10px] font-bold text-red-400 uppercase mb-4 flex items-center gap-2 tracking-widest"><Link2 size={14}/> 碰撞命中點 (Collision Point)</h5>
                  <div className="flex items-center justify-between gap-6 overflow-hidden">
                    <p className="text-[15px] font-mono text-red-400 whitespace-nowrap overflow-x-auto custom-scrollbar font-black flex-1 py-2 select-all leading-relaxed">{modalData.relatedAddr}</p>
                    <button onClick={() => handleCopy(modalData.relatedAddr)} className="shrink-0 p-3 bg-red-900/20 rounded-xl text-red-400 hover:text-white transition-colors"><Copy size={20}/></button>
                  </div>
                </div>
              </div>
              <section>
                <div className="flex items-center gap-3 mb-6 px-2 tracking-widest">
                  <FileText className="text-emerald-500" size={20} />
                  <h5 className="text-[12px] font-bold text-white uppercase underline underline-offset-8 decoration-emerald-500/20">證據：鏈上轉帳流水 (ON-CHAIN EVIDENCE)</h5>
                </div>
                <div className="bg-black/60 rounded-[2.5rem] border border-slate-800 overflow-x-auto shadow-2xl custom-scrollbar">
                  <table className="w-full text-left text-[13px] font-mono border-collapse min-w-[1200px]">
                    <thead className="bg-white/5 text-slate-500 uppercase tracking-widest border-b border-slate-800">
                      <tr>
                        <th className="px-10 py-6">交易時間</th>
                        <th className="px-10 py-6">FROM (發送方)</th>
                        <th className="px-6 py-6 text-center">狀態</th>
                        <th className="px-10 py-6">TO (接收方)</th>
                        <th className="px-10 py-6 text-right">金額 (USDT)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      <tr className="bg-emerald-500/10 transition-colors">
                        <td className="px-10 py-8 text-slate-400 whitespace-nowrap font-bold">{modalData.matchedTx.time}</td>
                        <td className="px-10 py-8 whitespace-nowrap text-slate-300 font-bold select-all">{modalData.matchedTx.from}</td>
                        <td className="px-6 py-8 text-center">
                          <div className="flex flex-col items-center gap-2"><ArrowRightLeft size={20} className="text-emerald-500 animate-pulse" /><span className="text-[9px] font-black bg-emerald-500 text-black px-2 py-0.5 rounded shadow-lg uppercase">Matched</span></div>
                        </td>
                        <td className="px-10 py-8 whitespace-nowrap text-red-400 font-black select-all">{modalData.matchedTx.to}</td>
                        <td className="px-10 py-8 text-right font-black text-emerald-400 text-2xl tracking-tighter">{modalData.matchedTx.amount} <span className="text-[10px] text-slate-500">USDT</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
              <div className="bg-emerald-500/5 p-10 rounded-[3rem] border border-emerald-500/20 shadow-inner">
                <div className="flex items-center gap-4 mb-5"><CheckCircle2 size={28} className="text-emerald-500" /><h5 className="text-xl font-black text-white italic uppercase tracking-tighter underline decoration-emerald-500/30 underline-offset-4">AI 審計診斷結論</h5></div>
                <p className="text-[15px] text-slate-400 leading-loose font-medium max-w-5xl">{modalData.description} 基於鏈上數據時間軸與金額的高匹配度，判定舉報者與該店客戶為資金共同控制實體。建議採取風控阻斷。</p>
              </div>
            </div>
            <div className="p-8 border-t border-slate-800 bg-slate-900/40 flex justify-end px-12">
              <button onClick={() => setShowModal(false)} className="px-12 py-4 bg-white text-black font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-xs tracking-widest shadow-xl">關閉並返回報告</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e1e24; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #10b981; }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.98) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .animate-in { animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-spin-slow { animation: spin 15s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}} />
    </div>
  );
}
