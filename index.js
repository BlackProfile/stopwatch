import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Plus, Flag, Trash2, StopCircle, User, 
  Clock, History, Sparkles, Loader, X, Trophy, Download, Target, 
  Calculator, Medal, Upload, FileSpreadsheet, CheckCircle, AlertCircle, Info, AlertTriangle, ChevronDown,
  BarChart2, List, Filter, ArrowUpDown
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';

// --- UTILITIES ---

const formatTime = (time) => {
  if (typeof time !== 'number' || isNaN(time)) return "00:00.00";
  const milliseconds = `0${Math.floor((time % 1000) / 10)}`.slice(-2);
  const seconds = `0${Math.floor((time / 1000) % 60)}`.slice(-2);
  const minutes = `0${Math.floor((time / 60000) % 60)}`.slice(-2);
  const hours = Math.floor(time / 3600000);
  return hours > 0 
    ? `${hours}:${minutes}:${seconds}.${milliseconds}` 
    : `${minutes}:${seconds}.${milliseconds}`;
};

const formatTimeAxis = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

const parseTargetToMs = (str) => {
  if (!str) return 0;
  const parts = str.split(':');
  if (parts.length !== 2) return 0;
  const min = parseInt(parts[0], 10) || 0;
  const sec = parseInt(parts[1], 10) || 0;
  return (min * 60000) + (sec * 1000);
};

// --- MARKDOWN RENDERER ---
const MarkdownRenderer = ({ content }) => {
  if (!content) return <div className="text-slate-400 italic text-center py-2">Tidak ada data analisis.</div>;
  const lines = content.split('\n');
  const parseInlineStyles = (text) => {
    return text.split(/(\*\*.*?\*\*)/g).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-slate-800">{part.slice(2, -2)}</strong>;
      }
      return part.split(/(\*.*?\*)/g).map((subPart, j) => {
         if (subPart.startsWith('*') && subPart.endsWith('*') && subPart.length > 1) {
           return <em key={`${i}-${j}`} className="italic text-slate-600 bg-slate-100 px-1 rounded">{subPart.slice(1, -1)}</em>;
         }
         return subPart;
      });
    });
  };

  return (
    <div className="space-y-2 text-sm text-slate-600 leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-2" />;
        if (trimmed.startsWith('###')) return <h3 key={idx} className="text-base font-bold text-indigo-700 mt-4 mb-2 pb-1 border-b border-indigo-50">{parseInlineStyles(trimmed.replace(/^###\s*/, ''))}</h3>;
        if (trimmed.startsWith('#')) return <h3 key={idx} className="text-lg font-bold text-slate-800 mt-4 mb-2">{parseInlineStyles(trimmed.replace(/^#+\s*/, ''))}</h3>;
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return <div key={idx} className="ml-2 flex items-start gap-2 mb-1"><span className="text-indigo-400 mt-1.5 text-[8px]">●</span><span className="flex-1">{parseInlineStyles(trimmed.replace(/^[-*]\s/, ''))}</span></div>;
        const numberMatch = trimmed.match(/^(\d+)\.\s(.*)/);
        if (numberMatch) return <div key={idx} className="ml-2 flex items-start gap-2 mb-1 bg-slate-50/50 p-1 rounded"><span className="font-bold text-indigo-600 min-w-[1.2rem]">{numberMatch[1]}.</span><span className="flex-1">{parseInlineStyles(numberMatch[2])}</span></div>;
        if (trimmed === '---' || trimmed === '***') return <hr key={idx} className="my-4 border-slate-200" />;
        return <div key={idx} className="min-h-[1.2em]">{parseInlineStyles(line)}</div>;
      })}
    </div>
  );
};

export default function App() {
  // --- STATE & PERSISTENCE ---
  const [masterTime, setMasterTime] = useState(() => {
    const saved = localStorage.getItem('runnerApp_masterTime');
    return saved ? parseInt(saved, 10) : 0;
  });
  
  const [isRunning, setIsRunning] = useState(false); 
  
  const [runners, setRunners] = useState(() => {
    const saved = localStorage.getItem('runnerApp_runners');
    return saved ? JSON.parse(saved) : [
      { id: 1, name: 'Pelari 1', splits: [], finished: false, finalTime: null }
    ];
  });

  const [targetPaceStr, setTargetPaceStr] = useState(() => {
    return localStorage.getItem('runnerApp_targetPaceStr') || "";
  });
  
  const [targetPaceMs, setTargetPaceMs] = useState(0);

  // Other UI States
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {}, type: 'danger' });
  const [filterRunnerId, setFilterRunnerId] = useState('all');
  const [sortMode, setSortMode] = useState('grouped'); 
  const [viewMode, setViewMode] = useState('table'); 

  const intervalRef = useRef(null);
  const startTimeRef = useRef(0);
  const fileInputRef = useRef(null); 

  // --- PERSISTENCE EFFECTS ---
  useEffect(() => {
    localStorage.setItem('runnerApp_runners', JSON.stringify(runners));
  }, [runners]);

  useEffect(() => {
    localStorage.setItem('runnerApp_targetPaceStr', targetPaceStr);
    setTargetPaceMs(parseTargetToMs(targetPaceStr));
  }, [targetPaceStr]);

  useEffect(() => {
    localStorage.setItem('runnerApp_masterTime', masterTime.toString());
  }, [masterTime]);

  // --- STOPWATCH LOGIC ---
  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = Date.now() - masterTime;
      intervalRef.current = setInterval(() => {
        setMasterTime(Date.now() - startTimeRef.current);
      }, 10);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  useEffect(() => {
    if (isRunning && runners.length > 0 && runners.every(r => r.finished)) {
      setIsRunning(false);
      addToast("Semua pelari selesai!", "success");
    }
  }, [runners, isRunning]);

  const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }));
  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  const toggleTimer = () => {
    const newState = !isRunning;
    setIsRunning(newState);
    addToast(newState ? "Stopwatch dimulai" : "Stopwatch dipause", "info");
  };
  
  const resetTimer = () => {
    const hasData = masterTime > 0 || runners.some(r => r.splits.length > 0);
    if (hasData) {
      setModal({
        isOpen: true,
        title: "Reset Semua?",
        message: "Tindakan ini akan menghapus semua waktu dan data pelari. Apakah Anda yakin?",
        type: "danger",
        onConfirm: () => {
          setIsRunning(false);
          setMasterTime(0);
          setAnalysisResult(null);
          setShowAnalysis(false);
          const resetRunners = runners.map(r => ({ ...r, splits: [], finished: false, finalTime: null }));
          setRunners(resetRunners);
          addToast("Waktu berhasil di-reset", "success");
          closeModal();
        }
      });
    } else {
      setIsRunning(false);
      setMasterTime(0);
      addToast("Waktu di-reset", "info");
    }
  };

  const addRunner = () => {
    setRunners(prev => {
      const newId = prev.length > 0 ? Math.max(...prev.map(r => r.id)) + 1 : 1;
      addToast(`Pelari ${newId} ditambahkan`, "success");
      return [...prev, { id: newId, name: `Pelari ${newId}`, splits: [], finished: false, finalTime: null }];
    });
  };

  const removeRunner = (id) => {
    setModal({
        isOpen: true,
        title: "Hapus Pelari?",
        message: "Pelari ini beserta seluruh data putarannya akan dihapus permanen.",
        type: "danger",
        onConfirm: () => {
            setRunners(prev => prev.filter(r => r.id !== id));
            addToast("Pelari dihapus", "info");
            closeModal();
        }
    });
  };

  const deleteAllRunners = () => {
    setModal({
        isOpen: true,
        title: "Hapus Semua Peserta?",
        message: "Semua peserta lari akan dihapus dari daftar. Data yang dihapus tidak dapat dikembalikan. Lanjutkan?",
        type: "danger",
        onConfirm: () => {
            setRunners([]);
            addToast("Semua peserta berhasil dihapus", "info");
            closeModal();
        }
    });
  };

  const updateRunnerName = (id, newName) => {
    setRunners(prev => prev.map(r => r.id === id ? { ...r, name: newName } : r));
  };

  const recordSplit = (id) => {
    setRunners(prev => prev.map(r => {
      if (r.id === id) {
        const lastSplitTime = r.splits.length > 0 ? r.splits[r.splits.length - 1].total : 0;
        const lapTime = masterTime - lastSplitTime;
        return {
          ...r,
          splits: [...r.splits, { index: r.splits.length + 1, total: masterTime, lap: lapTime, id: Date.now() + Math.random() }]
        };
      }
      return r;
    }));
  };

  const finishRunner = (id) => {
    setRunners(prev => prev.map(r => {
        if (r.id === id) {
            let newSplits = [...r.splits];
            const lastSplitTime = r.splits.length > 0 ? r.splits[r.splits.length - 1].total : 0;
            const lapTime = masterTime - lastSplitTime;
            if (lapTime > 100) { 
                newSplits.push({ index: r.splits.length + 1, total: masterTime, lap: lapTime, isFinish: true, id: Date.now() + Math.random() });
            } else if (newSplits.length > 0) {
                newSplits[newSplits.length - 1].isFinish = true;
            }
            addToast(`${r.name} telah Finish!`, "success");
            return { ...r, finished: true, finalTime: masterTime, splits: newSplits };
        }
        return r;
    }));
  };

  const deleteSplit = (runnerId, splitUniqueId) => {
    setModal({
        isOpen: true,
        title: "Hapus Split?",
        message: "Menghapus split ini akan menghitung ulang durasi putaran. Lanjutkan?",
        type: "danger",
        onConfirm: () => {
            setRunners(prev => prev.map(r => {
              if (r.id !== runnerId) return r;
              const filteredSplits = r.splits.filter(s => s.id !== splitUniqueId);
              const recalculatedSplits = filteredSplits.map((split, idx) => {
                const prevTotal = idx === 0 ? 0 : filteredSplits[idx - 1].total;
                return { ...split, index: idx + 1, lap: split.total - prevTotal };
              });
              return { ...r, splits: recalculatedSplits };
            }));
            addToast("Split berhasil dihapus", "info");
            closeModal();
        }
    });
  };

  const exportToCSV = () => {
    const finishedRunners = runners.filter(r => r.finished && r.finalTime !== null).sort((a, b) => a.finalTime - b.finalTime);
    const getRank = (id) => { const idx = finishedRunners.findIndex(r => r.id === id); return idx === -1 ? "-" : idx + 1; };
    const headers = ["Peringkat", "Nama Pelari", "Lap #", "Waktu Lap", "Waktu Total", "Status"];
    const rows = runners.flatMap(r => r.splits.map(s => [getRank(r.id), `"${r.name}"`, s.index, formatTime(s.lap), formatTime(s.total), s.isFinish ? "Finish" : "Split"]));
    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.setAttribute("download", `hasil_lomba_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    addToast("File CSV berhasil diunduh", "success");
  };

  const handleTargetChange = (e) => {
    setTargetPaceStr(e.target.value);
  };
  
  const downloadImportTemplate = () => {
    const csvContent = "Nama Pelari\nBudi Santoso\nSiti Aminah\nAhmad Yani\nDewi Sartika";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "template_nama_pelari.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast("Template berhasil diunduh", "success");
  };

  const handleImportClick = () => fileInputRef.current.click();
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split(/\r?\n/);
      const startIndex = lines[0].toLowerCase().includes('nama') ? 1 : 0;
      const newRunners = [];
      let currentId = runners.length > 0 ? Math.max(...runners.map(r => r.id)) + 1 : 1;
      for (let i = startIndex; i < lines.length; i++) {
        const name = lines[i].trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
        if (name) newRunners.push({ id: currentId++, name: name, splits: [], finished: false, finalTime: null });
      }
      if (newRunners.length > 0) {
        setRunners(prev => [...prev, ...newRunners]);
        addToast(`Berhasil mengimpor ${newRunners.length} pelari!`, "success");
      } else {
        addToast("Tidak ada nama valid ditemukan", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = null; 
  };
  
  const analyzeRaceWithAI = async () => {
    const hasData = runners.some(r => r.splits.length > 0);
    if (!hasData) {
      addToast("Belum ada data untuk dianalisis", "error");
      return;
    }
    setIsAnalyzing(true);
    setShowAnalysis(true);
    addToast("Memulai analisis AI...", "info");
    
    try {
      const raceData = runners.map(r => {
        const laps = r.splits.map(s => `${formatTime(s.lap)}`).join(', ');
        return `Pelari: ${r.name}\nStatus: ${r.finished ? 'Selesai' : 'Lari'}\nTotal: ${r.finished ? formatTime(r.finalTime) : '-'}\nLaps: [${laps}]`;
      }).join('\n\n');
      const systemPrompt = `Anda pelatih lari atletik. Analisis data pelari berikut. Berikan wawasan singkat untuk SETIAP pelari. Gunakan format Markdown rapi dalam Bahasa Indonesia.`;
      const userPrompt = `Data lari saat ini:\n\n${raceData}`;
      const apiKey = ""; 
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: userPrompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] } })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      setAnalysisResult(data.candidates?.[0]?.content?.parts?.[0]?.text || "Gagal mendapatkan respons.");
      addToast("Analisis AI Selesai!", "success");
    } catch (error) {
      console.error(error);
      setAnalysisResult("Gagal analisis AI.");
      addToast("Terjadi kesalahan pada AI", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const finishedRunners = runners.filter(r => r.finished && r.finalTime !== null).sort((a, b) => a.finalTime - b.finalTime);
  const getRankData = (id) => {
    const index = finishedRunners.findIndex(r => r.id === id);
    if (index === -1) return null;
    return {
      rank: index + 1,
      label: index === 0 ? "Juara 1" : index === 1 ? "Juara 2" : index === 2 ? "Juara 3" : `Posisi ${index + 1}`,
      color: index === 0 ? "text-yellow-600 bg-yellow-100 border-yellow-200" : index === 1 ? "text-slate-600 bg-slate-200 border-slate-300" : index === 2 ? "text-orange-700 bg-orange-100 border-orange-200" : "text-slate-500 bg-slate-100 border-slate-200",
      iconColor: index === 0 ? "text-yellow-500" : index === 1 ? "text-slate-400" : index === 2 ? "text-orange-500" : "text-slate-400"
    };
  };

  const runnerStats = useMemo(() => {
    const stats = {};
    runners.forEach(r => {
      if (r.splits.length > 0) {
        const laps = r.splits.map(s => s.lap);
        const minLap = Math.min(...laps);
        const avgLap = laps.reduce((a, b) => a + b, 0) / laps.length;
        stats[r.id] = { minLap, avgLap };
      }
    });
    return stats;
  }, [runners]);

  const processedSplits = useMemo(() => {
    let splits = runners.flatMap(r => r.splits.map(s => ({ ...s, runnerName: r.name, runnerId: r.id })));
    if (filterRunnerId !== 'all') {
      splits = splits.filter(s => s.runnerId.toString() === filterRunnerId);
    }
    if (sortMode === 'chronological') {
       return splits.sort((a, b) => b.total - a.total);
    } else {
       return splits.sort((a, b) => {
         if (a.runnerId !== b.runnerId) return a.runnerId - b.runnerId;
         return a.index - b.index;
       });
    }
  }, [runners, filterRunnerId, sortMode]);

  const chartData = useMemo(() => {
    const maxLaps = Math.max(0, ...runners.map(r => r.splits.length));
    const data = [];
    for (let i = 1; i <= maxLaps; i++) {
        const point = { lapName: `Lap ${i}` };
        runners.forEach(r => {
            if (filterRunnerId !== 'all' && r.id.toString() !== filterRunnerId) return;
            const split = r.splits.find(s => s.index === i);
            if (split) {
                point[r.name] = split.lap; 
            }
        });
        data.push(point);
    }
    return data;
  }, [runners, filterRunnerId]);

  const CHART_COLORS = ["#2563eb", "#db2777", "#ea580c", "#16a34a", "#9333ea", "#0891b2"];

  return (
    <div 
      className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-20 relative select-none" 
      onContextMenu={(e) => e.preventDefault()}
    >
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
      `}</style>
      
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv, .txt" style={{ display: 'none' }} />

      {/* --- MODAL --- */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
             <div className="p-6 flex items-start gap-4">
                <div className={`p-3 rounded-full shrink-0 ${modal.type === 'danger' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                  {modal.type === 'danger' ? <AlertTriangle size={24} /> : <Info size={24} />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">{modal.title}</h3>
                  <p className="text-sm text-slate-600">{modal.message}</p>
                </div>
             </div>
             <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
               <button onClick={closeModal} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg">Batal</button>
               <button onClick={modal.onConfirm} className={`px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm ${modal.type === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>Ya, Lanjutkan</button>
             </div>
           </div>
        </div>
      )}

      {/* --- TOAST --- */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border animate-in slide-in-from-right-10 ${toast.type === 'success' ? 'bg-white border-green-200 text-green-800' : toast.type === 'error' ? 'bg-white border-red-200 text-red-800' : 'bg-slate-800 border-slate-700 text-white'}`}>
            {toast.type === 'success' && <CheckCircle size={20} className="text-green-500" />}
            {toast.type === 'error' && <AlertCircle size={20} className="text-red-500" />}
            {toast.type === 'info' && <Info size={20} className="text-blue-400" />}
            <span className="text-sm font-medium">{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} className="ml-2 hover:opacity-70"><X size={16} /></button>
          </div>
        ))}
      </div>

      {/* HEADER UTAMA */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-col xl:flex-row items-center justify-between gap-4">
          <div className="flex flex-col items-center xl:items-start min-w-[180px]">
            <h1 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Multi-Runner Pro</h1>
            <div className="text-4xl md:text-5xl font-mono font-bold text-blue-600 tabular-nums tracking-tight leading-none my-1">{formatTime(masterTime)}</div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={toggleTimer} className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-white shadow-md active:scale-95 transition-transform ${isRunning ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'}`}>{isRunning ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}{isRunning ? "Pause" : "Start"}</button>
            <button onClick={resetTimer} disabled={masterTime === 0 && runners.every(r => r.splits.length === 0)} className="flex items-center gap-2 px-5 py-2.5 rounded-full font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><RotateCcw size={20} /> Reset</button>
            
            {/* Tombol Hapus Semua Peserta */}
            <button onClick={deleteAllRunners} className="flex items-center gap-2 px-3 py-2.5 rounded-full font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-colors" title="Hapus Semua Peserta"><Trash2 size={20} /></button>
            
            <button onClick={addRunner} className="flex items-center gap-2 px-4 py-2.5 rounded-full font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors" title="Tambah Pelari Manual"><Plus size={20} /></button>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-2">
             <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                <button onClick={downloadImportTemplate} className="flex flex-col items-center justify-center w-12 h-10 rounded bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors" title="Download Template"><FileSpreadsheet size={16} /><span className="text-[9px] font-bold mt-0.5">Templat</span></button>
                <button onClick={handleImportClick} className="flex flex-col items-center justify-center w-12 h-10 rounded bg-white border border-slate-200 text-slate-500 hover:text-green-600 hover:border-green-300 transition-colors" title="Import CSV"><Upload size={16} /><span className="text-[9px] font-bold mt-0.5">Import</span></button>
             </div>
             <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg border border-slate-200 h-[54px]">
                <Target size={18} className="text-slate-500" />
                <div className="flex flex-col">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase">Target Lap</label>
                  <input type="text" placeholder="00:00" value={targetPaceStr} onChange={handleTargetChange} className="w-16 bg-transparent text-sm font-mono font-bold text-slate-700 focus:outline-none placeholder:text-slate-300 select-text" />
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* DAFTAR PELARI */}
      <div className="max-w-6xl mx-auto p-4 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
        {runners.length === 0 && (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-400">
                <User size={48} className="mb-4 opacity-50" />
                <p className="text-lg font-semibold">Belum ada pelari</p>
                <p className="text-sm">Klik tombol <span className="font-bold text-blue-500">+</span> untuk menambahkan pelari.</p>
            </div>
        )}
        {runners.map((runner) => {
          const rankData = getRankData(runner.id);
          if (filterRunnerId !== 'all' && runner.id.toString() !== filterRunnerId) return null;

          return (
            <div key={runner.id} className={`relative bg-white rounded-xl shadow-sm border-2 overflow-hidden transition-all ${runner.finished ? 'border-green-400 bg-green-50' : 'border-white'}`}>
              <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`p-2 rounded-full ${runner.finished ? 'bg-green-200 text-green-700' : 'bg-indigo-100 text-indigo-600'}`}><User size={18} /></div>
                  <input type="text" value={runner.name} onChange={(e) => updateRunnerName(runner.id, e.target.value)} disabled={masterTime > 0} className="bg-transparent font-bold text-lg text-slate-700 focus:outline-none w-full disabled:cursor-default select-text" />
                  {rankData && <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-bold uppercase ${rankData.color}`}><Trophy size={12} className={rankData.iconColor} fill="currentColor" />{rankData.label}</div>}
                </div>
                <button onClick={() => removeRunner(runner.id)} className="text-slate-300 hover:text-red-500 p-1.5 transition-colors"><Trash2 size={16} /></button>
              </div>
              <div className="p-4 flex justify-between items-center">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">Total Waktu</div>
                  <div className={`text-3xl font-mono font-bold tabular-nums ${runner.finished ? 'text-green-600' : 'text-slate-800'}`}>{runner.finished ? formatTime(runner.finalTime) : formatTime(masterTime)}</div>
                  {runner.splits.length > 0 ? <div className="mt-2 text-sm flex items-center gap-1.5 text-slate-600 bg-slate-100 px-2 py-1 rounded w-fit"><History size={14} className="text-indigo-400" /><span>Lap {runner.splits.length}:</span><span className="font-mono font-bold text-indigo-600">+{formatTime(runner.splits[runner.splits.length - 1].lap)}</span></div> : <div className="mt-2 text-sm text-slate-400 italic h-6 flex items-center">Siap Lari...</div>}
                </div>
                <div className="flex gap-2">
                  {!runner.finished ? (
                    <>
                      <button onClick={() => recordSplit(runner.id)} disabled={!isRunning} className="group flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 border-2 border-indigo-100 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 disabled:opacity-50 active:scale-95 transition-all"><Flag size={20} className="mb-0.5" /><span className="text-[9px] font-bold">SPLIT</span></button>
                      <button onClick={() => finishRunner(runner.id)} disabled={!isRunning && masterTime === 0} className="group flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-slate-50 text-slate-500 border-2 border-slate-200 hover:bg-red-500 hover:text-white hover:border-red-500 disabled:opacity-50 active:scale-95 transition-all"><StopCircle size={20} className="mb-0.5" /><span className="text-[9px] font-bold">STOP</span></button>
                    </>
                  ) : (
                    <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl border-2 animate-pulse ${rankData ? rankData.color : 'bg-green-100 text-green-600 border-green-200'}`}>{rankData && rankData.rank <= 3 ? <Medal size={24} className={rankData.iconColor} /> : <Trophy size={24} />}{rankData && <span className="text-[9px] font-bold mt-0.5">#{rankData.rank}</span>}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* AREA ANALISIS & TABEL/GRAFIK */}
      <div className="max-w-6xl mx-auto p-4 mt-2">
         {showAnalysis && (
           <div className="bg-white rounded-xl shadow-lg border border-indigo-100 overflow-hidden mb-6 relative ring-4 ring-indigo-50">
              <div className="p-3 border-b border-indigo-50 flex items-center justify-between bg-indigo-50/50">
                <h3 className="font-bold text-indigo-700 flex items-center gap-2 text-sm"><Sparkles size={16} className={isAnalyzing ? "animate-spin" : ""} />{isAnalyzing ? "Sedang Menganalisis..." : "Analisis Pelatih AI"}</h3>
                <button onClick={() => setShowAnalysis(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
              </div>
              <div className="p-5 text-sm leading-relaxed bg-gradient-to-b from-white to-slate-50 max-h-[400px] overflow-y-auto custom-scrollbar">{isAnalyzing ? <div className="flex flex-col items-center justify-center py-6 text-indigo-400 gap-2"><Loader className="animate-spin" size={24} /><span className="text-xs font-semibold animate-pulse">Sedang Menganalisis...</span></div> : <MarkdownRenderer content={analysisResult} />}</div>
           </div>
         )}

         <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden transition-all duration-300">
            {/* Header Collapsible */}
            <div className="bg-slate-50 p-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
               <div 
                 className="flex items-center gap-2 cursor-pointer select-none hover:text-indigo-600 transition-colors"
                 onClick={() => setIsDetailsOpen(!isDetailsOpen)}
               >
                  <div className={`transition-transform duration-200 ${isDetailsOpen ? 'rotate-0' : '-rotate-90'}`}><ChevronDown size={20} className="text-slate-400" /></div>
                  <h2 className="font-bold text-slate-700 flex items-center gap-2"><Clock size={18} /> Detail Putaran</h2>
                  <span className="text-xs font-medium text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">{processedSplits.length}</span>
               </div>
               
               {/* Controls Bar */}
               {isDetailsOpen && (
                 <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
                    <div className="relative group">
                       <Filter size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                       <select value={filterRunnerId} onChange={(e) => setFilterRunnerId(e.target.value)} className="pl-8 pr-3 py-1.5 bg-white border border-slate-300 text-slate-600 text-xs font-bold rounded-lg focus:outline-none focus:border-indigo-400 hover:border-slate-400 transition-colors appearance-none cursor-pointer">
                         <option value="all">Semua Pelari</option>
                         {runners.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                       </select>
                    </div>
                    <div className="h-6 w-px bg-slate-300 mx-1"></div>
                    <button onClick={() => setSortMode(prev => prev === 'grouped' ? 'chronological' : 'grouped')} className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-bold rounded-lg transition-colors shadow-sm ${sortMode === 'chronological' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`} title="Ubah Mode Urutan"><ArrowUpDown size={14} />{sortMode === 'grouped' ? 'Per Pelari' : 'Live Feed'}</button>
                    <div className="flex bg-slate-200 p-0.5 rounded-lg border border-slate-300">
                        <button onClick={() => setViewMode('table')} className={`p-1 rounded-md transition-all ${viewMode === 'table' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} title="Tampilan Tabel"><List size={16} /></button>
                        <button onClick={() => setViewMode('chart')} className={`p-1 rounded-md transition-all ${viewMode === 'chart' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} title="Tampilan Grafik"><BarChart2 size={16} /></button>
                    </div>
                    <div className="h-6 w-px bg-slate-300 mx-1"></div>
                    <button onClick={exportToCSV} disabled={processedSplits.length === 0} className="p-1.5 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-green-600 rounded-lg transition-colors shadow-sm disabled:opacity-50" title="Download CSV"><Download size={16} /></button>
                    <button onClick={analyzeRaceWithAI} disabled={isAnalyzing || runners.every(r => r.splits.length === 0)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm disabled:bg-indigo-300"><Sparkles size={14} /> AI</button>
                 </div>
               )}
            </div>
            
            {isDetailsOpen && (
              <div className="max-h-[500px] overflow-y-auto custom-scrollbar animate-in slide-in-from-top-2 duration-200 bg-white">
                {viewMode === 'table' ? (
                   <table className="w-full text-sm text-left border-collapse">
                     <thead className="text-xs text-slate-500 uppercase bg-slate-100 sticky top-0 z-10 shadow-sm">
                       <tr>
                         <th className="px-4 py-3 bg-slate-100 w-1/4">Nama Pelari</th>
                         <th className="px-4 py-3 bg-slate-100 text-center w-16">Lap</th>
                         <th className="px-4 py-3 bg-slate-100 text-right">Waktu Lap</th>
                         <th className="px-4 py-3 bg-slate-100 text-right">Total</th>
                         <th className="px-2 py-3 bg-slate-100 text-center w-10"></th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-50">
                       {processedSplits.length === 0 ? (
                         <tr><td colSpan="5" className="px-4 py-12 text-center text-slate-400 italic">Belum ada data rekaman waktu.</td></tr>
                       ) : (
                         processedSplits.map((split, idx) => {
                           const isGrouped = sortMode === 'grouped';
                           const isNewRunner = idx === 0 || (isGrouped && split.runnerId !== processedSplits[idx - 1].runnerId);
                           const isLastRowForRunner = isGrouped && (idx === processedSplits.length - 1 || split.runnerId !== processedSplits[idx + 1].runnerId);
                           
                           const stats = runnerStats[split.runnerId];
                           const isBestLap = stats && split.lap === stats.minLap && !split.isFinish;
                           const rankData = getRankData(split.runnerId);

                           let timeColorClass = "text-blue-600";
                           if (targetPaceMs > 0 && !split.isFinish) timeColorClass = split.lap <= targetPaceMs ? "text-green-600" : "text-red-500";

                           return (
                             <React.Fragment key={`${split.runnerId}-${split.index}`}>
                               <tr className={`group transition-colors ${split.isFinish ? 'bg-green-50/40' : 'hover:bg-slate-50'} ${isNewRunner && idx !== 0 ? 'border-t-4 border-slate-100' : ''}`}>
                                 <td className="px-4 py-2 font-bold text-slate-700 align-top">
                                   {(!isGrouped || isNewRunner) && (
                                     <div className="flex flex-col gap-1 py-1">
                                       <div className="flex items-center gap-2">
                                         <span className="text-sm">{split.runnerName}</span>
                                         {split.isFinish && rankData && rankData.rank <= 3 && <Medal size={14} className={rankData.iconColor} />}
                                       </div>
                                       {split.isFinish && <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded w-fit font-bold border ${rankData ? rankData.color : 'bg-green-100 text-green-700 border-green-200'}`}>{rankData ? rankData.label : "Selesai"}</span>}
                                     </div>
                                   )}
                                 </td>
                                 <td className="px-4 py-2 text-center text-slate-500 font-mono">{split.index}</td>
                                 <td className={`px-4 py-2 text-right font-mono font-bold ${timeColorClass}`}>
                                   <div className="flex items-center justify-end gap-2">{isBestLap && <Trophy size={14} className="text-yellow-500" title="Best Lap" />}+{formatTime(split.lap)}</div>
                                 </td>
                                 <td className="px-4 py-2 text-right font-mono text-slate-500">{formatTime(split.total)}</td>
                                 <td className="px-2 py-2 text-center">
                                   <button onClick={() => deleteSplit(split.runnerId, split.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity p-1" title="Hapus baris ini"><X size={14} /></button>
                                 </td>
                               </tr>
                               {isGrouped && isLastRowForRunner && stats && (
                                  <tr className="bg-slate-50 border-b border-slate-200">
                                     <td colSpan="2" className="px-4 py-2 text-right text-xs font-bold text-slate-400 uppercase tracking-wide"><div className="flex items-center justify-end gap-1"><Calculator size={12} /> Rata-rata:</div></td>
                                     <td className="px-4 py-2 text-right font-mono text-xs font-bold text-slate-600">{formatTime(stats.avgLap)}</td>
                                     <td colSpan="2"></td>
                                  </tr>
                               )}
                             </React.Fragment>
                           );
                         })
                       )}
                     </tbody>
                   </table>
                ) : (
                   <div className="h-[400px] w-full p-4 bg-slate-50">
                      {chartData.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 italic">Belum ada data grafik.</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                           <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="lapName" stroke="#64748b" fontSize={12} tickMargin={10} />
                              <YAxis stroke="#64748b" fontSize={12} tickFormatter={formatTimeAxis} domain={['auto', 'auto']} />
                              <RechartsTooltip 
                                contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', border: 'none' }}
                                formatter={(value) => [formatTime(value), 'Waktu']}
                                labelStyle={{ color: '#64748b', marginBottom: '0.5rem' }}
                              />
                              <Legend verticalAlign="top" height={36} />
                              {runners.map((r, i) => {
                                 if (filterRunnerId !== 'all' && r.id.toString() !== filterRunnerId) return null;
                                 return (
                                   <Line 
                                     key={r.id}
                                     type="monotone" 
                                     dataKey={r.name} 
                                     stroke={CHART_COLORS[i % CHART_COLORS.length]} 
                                     strokeWidth={3}
                                     activeDot={{ r: 6 }}
                                     connectNulls
                                   />
                                 );
                              })}
                           </LineChart>
                        </ResponsiveContainer>
                      )}
                   </div>
                )}
              </div>
            )}
         </div>
      </div>
    </div>
  );
}
