
import React, { useState, useRef } from 'react';
import { vectorStore } from '../services/vectorStore';
import { parseFile, splitTextIntoChunks } from '../services/documentProcessor';
import { ProcessingState, ChatSession } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onIndexUpdated: () => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onImportSessions: (data: any) => void;
  theme: 'dark' | 'light';
}

const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen,
  onToggle,
  onIndexUpdated, 
  sessions, 
  activeSessionId, 
  onSelectSession, 
  onNewChat,
  onDeleteSession,
  onImportSessions,
  theme
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<ProcessingState>({
    status: 'idle',
    progress: 0,
    message: 'System Ready'
  });
  const [stats, setStats] = useState({ totalChunks: 0 });
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(Array.from(e.target.files));
  };

  const handleIndex = async () => {
    if (files.length === 0) return;
    setStatus({ status: 'processing', progress: 10, message: 'Calibrating Multi-Node Sensors...' });
    try {
      vectorStore.clear();
      let totalChunks = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const text = await parseFile(file);
        const chunks = splitTextIntoChunks(text, file.name);
        vectorStore.addChunks(chunks);
        totalChunks += chunks.length;
        setStatus(prev => ({ 
          ...prev, 
          progress: 10 + Math.round((i + 1) / files.length * 80),
          message: `Absorbing Fragment: ${file.name}` 
        }));
      }
      setStats({ totalChunks });
      setStatus({ status: 'completed', progress: 100, message: 'Bio-Matrix Synchronized' });
      onIndexUpdated();
    } catch (err: any) {
      setStatus({ status: 'error', progress: 0, message: `Node Fault: ${err.message}` });
    }
  };

  const handleBulkExport = () => {
    const content = JSON.stringify(sessions, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `neural-backup-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      onImportSessions(JSON.parse(await file.text()));
    } catch (err) {
      alert("Encryption mismatch: Backup invalid.");
    }
    e.target.value = '';
  };

  const isDark = theme === 'dark';

  return (
    <aside className={`transition-all duration-700 ease-in-out border-r overflow-hidden flex flex-col z-40 relative h-full shadow-2xl ${
      isOpen ? 'w-[28rem]' : 'w-0 border-none'
    } ${isDark ? 'bg-zinc-950/80 border-emerald-900/30 backdrop-blur-3xl' : 'bg-white border-zinc-200'}`}>
      
      {/* Sidebar Close Button */}
      <button 
        onClick={onToggle}
        className={`absolute top-10 right-8 p-4 rounded-2xl transition-all z-50 hover:scale-125 active:scale-90 ${isDark ? 'text-zinc-500 hover:bg-emerald-500/10 hover:text-emerald-400' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900'}`}
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
      </button>

      {/* Branding Section */}
      <div className={`p-10 border-b transition-colors ${isDark ? 'border-emerald-900/20' : 'border-zinc-100'}`}>
        <div className="flex items-center gap-6 mb-10">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-emerald-500/40 shrink-0 transform hover:scale-110 hover:rotate-6 transition-all">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="whitespace-nowrap">
            <h1 className={`text-3xl font-black tracking-tighter uppercase italic leading-none ${isDark ? 'text-white' : 'text-zinc-900'}`}>ApexCore</h1>
          </div>
        </div>
        
        <button 
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[2rem] py-5 px-8 transition-all shadow-2xl shadow-emerald-600/30 group active:scale-[0.96] hover:translate-y-[-4px] hover:shadow-emerald-500/50"
        >
          <svg className="w-6 h-6 group-hover:rotate-180 transition-transform duration-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-base font-black uppercase tracking-[0.2em] whitespace-nowrap">Init Neural Link</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-8 space-y-12 scrollbar-hide">
        {/* Sessions Section */}
        <section>
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className={`text-[12px] font-black uppercase tracking-[0.4em] ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>Recent Transmissions</h3>
            <div className="flex items-center gap-4">
              <input type="file" ref={importInputRef} onChange={handleImportFile} className="hidden" accept=".json" />
              <button onClick={() => importInputRef.current?.click()} className={`p-3 rounded-2xl transition-all hover:scale-110 active:scale-90 ${isDark ? 'bg-zinc-900/50 hover:bg-emerald-500/20 text-zinc-500 hover:text-emerald-400' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-500'}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </button>
              <button onClick={handleBulkExport} className={`p-3 rounded-2xl transition-all hover:scale-110 active:scale-90 ${isDark ? 'bg-zinc-900/50 hover:bg-emerald-500/20 text-zinc-500 hover:text-emerald-400' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-500'}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </button>
            </div>
          </div>
          <div className="space-y-4">
            {sessions.length === 0 ? (
              <div className={`px-6 py-16 text-center border-4 border-dotted rounded-[3rem] ${isDark ? 'border-emerald-900/10' : 'border-zinc-200'}`}>
                <p className={`text-sm font-black uppercase tracking-[0.3em] italic leading-loose ${isDark ? 'text-zinc-800' : 'text-zinc-400'}`}>Archives Vacant.</p>
              </div>
            ) : (
              sessions.map(s => (
                <div 
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  className={`group relative flex items-center justify-between p-6 rounded-[2rem] cursor-pointer transition-all border-2 transform hover:translate-x-2 ${
                    activeSessionId === s.id 
                      ? (isDark ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-2xl shadow-emerald-500/20' : 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xl')
                      : (isDark ? 'bg-transparent border-transparent text-zinc-600 hover:bg-zinc-900/80 hover:border-emerald-900/40 hover:text-zinc-300' : 'bg-transparent border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900')
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-6">
                    <p className="text-base font-black truncate leading-tight mb-2 tracking-tight uppercase italic">{s.title}</p>
                    <p className={`text-[11px] font-mono opacity-60 uppercase tracking-widest ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{new Date(s.lastTimestamp).toLocaleTimeString()}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }} className={`opacity-0 group-hover:opacity-100 p-3 hover:text-rose-500 transition-all rounded-[1.5rem] transform hover:scale-125 ${isDark ? 'hover:bg-rose-500/20' : 'hover:bg-rose-100'}`}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Universal Input Section */}
        <section className="space-y-8">
          <div className="flex items-center justify-between px-2">
            <h3 className={`text-[12px] font-black uppercase tracking-[0.4em] ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>Bio-Node Ingestion</h3>
          </div>
          <div className="relative group">
            <div className={`absolute -inset-2 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600 rounded-[3rem] blur-2xl opacity-0 group-hover:opacity-30 transition duration-1000`} />
            <div className={`relative border-2 rounded-[3rem] p-10 text-center transition-all cursor-pointer transform hover:scale-[1.03] active:scale-95 ${isDark ? 'bg-zinc-900/60 border-emerald-900/30 hover:border-emerald-400 shadow-2xl' : 'bg-zinc-50 border-zinc-200 hover:bg-white'}`}>
              <input type="file" multiple onChange={handleFileChange} className="hidden" id="file-upload-sidebar" accept=".pdf,.txt,.md,.docx,.html,.htm,.json,.csv,.xml,.yaml,.yml" />
              <label htmlFor="file-upload-sidebar" className="cursor-pointer">
                <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border-2 shadow-2xl transition-all group-hover:scale-110 group-hover:rotate-12 ${isDark ? 'bg-zinc-950 border-emerald-900/60' : 'bg-white border-zinc-200'}`}>
                  <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <p className={`text-[12px] font-black uppercase tracking-[0.3em] ${isDark ? 'text-zinc-200' : 'text-zinc-600'}`}>{files.length > 0 ? `${files.length} Nodes Identified` : 'Sync Knowledge Matrix'}</p>
                <p className={`text-[9px] mt-3 uppercase tracking-widest opacity-50 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>PDF • DOCX • HTML • JSON • CSV • YAML</p>
              </label>
            </div>
          </div>
          {files.length > 0 && (
            <button onClick={handleIndex} disabled={status.status === 'processing'} className="w-full py-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[2rem] text-sm font-black uppercase tracking-[0.3em] transition-all shadow-2xl shadow-emerald-600/40 hover:translate-y-[-4px] active:scale-95">
              {status.status === 'processing' ? 'Absorbing Matrix...' : 'Establish Synergy'}
            </button>
          )}
          {status.status !== 'idle' && (
            <div className={`p-8 rounded-[2.5rem] border-2 space-y-6 animate-in slide-in-from-bottom-6 ${isDark ? 'bg-zinc-950/60 border-emerald-900/30' : 'bg-zinc-50 border-zinc-200 shadow-xl'}`}>
              <div className="flex justify-between items-center text-[11px] font-black text-zinc-500 uppercase tracking-widest">
                <span>Core Integrity</span>
                <span className={status.status === 'completed' ? 'text-emerald-400' : 'text-amber-500 animate-pulse'}>{status.message}</span>
              </div>
              <div className="h-3 bg-zinc-900 rounded-full overflow-hidden shadow-inner border border-white/5">
                <div className="h-full bg-gradient-to-r from-emerald-600 to-teal-400 transition-all duration-1000 shadow-[0_0_15px_rgba(16,185,129,0.5)]" style={{ width: `${status.progress}%` }} />
              </div>
            </div>
          )}
        </section>
      </div>

      <div className={`p-10 border-t ${isDark ? 'border-emerald-900/30 bg-zinc-950/60' : 'border-zinc-100 bg-zinc-50'}`}>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <span className={`text-[11px] font-black uppercase tracking-[0.5em] ${isDark ? 'text-zinc-700' : 'text-zinc-400'}`}>Active Matrix</span>
            <span className="text-2xl font-mono font-black text-emerald-500">{stats.totalChunks}</span>
          </div>
          <div className="flex flex-col text-right gap-2">
            <span className={`text-[11px] font-black uppercase tracking-[0.5em] ${isDark ? 'text-zinc-700' : 'text-zinc-400'}`}>Protocols</span>
            <span className={`text-base font-mono font-black ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>BM25-α-MULTI</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
