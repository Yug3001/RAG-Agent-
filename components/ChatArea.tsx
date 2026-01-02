
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage, DocumentChunk, ChatSession } from '../types';
import { vectorStore } from '../services/vectorStore';
import { geminiService } from '../services/gemini';

interface ChatAreaProps {
  indexReady: boolean;
  activeSession: ChatSession | undefined;
  onMessagesUpdate: (messages: ChatMessage[]) => void;
  onNewChat: () => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

const ChatArea: React.FC<ChatAreaProps> = ({ 
  indexReady, 
  activeSession, 
  onMessagesUpdate, 
  onNewChat, 
  isSidebarOpen, 
  toggleSidebar,
  theme,
  toggleTheme
}) => {
  const [inputValue, setInputValue] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [strictMode, setStrictMode] = useState(true);
  const [lastRetrieved, setLastRetrieved] = useState<DocumentChunk[]>([]);
  const [showRetrieved, setShowRetrieved] = useState(false);

  // Speech States
  const [isAutoRead, setIsAutoRead] = useState(false);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('');
  const [showSpeechSettings, setShowSpeechSettings] = useState(false);
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [activeSession?.messages, isLoading]);

  // Load Voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      if (availableVoices.length > 0 && !selectedVoiceName) {
        // Default to a natural sounding English voice if possible
        const preferred = availableVoices.find(v => v.lang.includes('en-US') && v.name.includes('Google')) || availableVoices[0];
        setSelectedVoiceName(preferred.name);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const isDark = theme === 'dark';

  const speak = (text: string, id: string) => {
    window.speechSynthesis.cancel();
    if (currentlySpeakingId === id) {
      setCurrentlySpeakingId(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = voices.find(v => v.name === selectedVoiceName);
    if (voice) utterance.voice = voice;
    utterance.rate = speechRate;
    
    utterance.onstart = () => setCurrentlySpeakingId(id);
    utterance.onend = () => setCurrentlySpeakingId(null);
    utterance.onerror = () => setCurrentlySpeakingId(null);

    window.speechSynthesis.speak(utterance);
  };

  const parseReasoning = (content: string) => {
    const delimiter = "---REASONING_METADATA---";
    if (!content.includes(delimiter)) return { main: content, meta: null };
    
    const [main, rawMeta] = content.split(delimiter);
    const meta: Record<string, string> = {};
    
    rawMeta.split('\n').forEach(line => {
      if (line.includes(':')) {
        const [key, ...val] = line.split(':');
        meta[key.trim().toUpperCase()] = val.join(':').trim();
      }
    });
    
    return { main: main.trim(), meta };
  };

  const highlightText = (text: string, query: string) => {
    if (!query || !useSearch) return text;
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (terms.length === 0) return text;

    const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) => 
      regex.test(part) ? (
        <mark key={i} className={`${isDark ? 'bg-emerald-500/40 text-white' : 'bg-emerald-200 text-zinc-900'} rounded-lg px-2 py-0.5 font-bold shadow-sm transition-all hover:scale-105 inline-block`}>
          {part}
        </mark>
      ) : part
    );
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading || !activeSession) return;

    const query = inputValue;
    setLastQuery(query);
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: Date.now(),
    };

    const newMessages = [...activeSession.messages, userMessage];
    onMessagesUpdate(newMessages);
    setInputValue('');
    setIsLoading(true);
    setShowRetrieved(false);

    try {
      const relevantChunks = await vectorStore.retrieve(query);
      setLastRetrieved(relevantChunks);
      const context = relevantChunks.length > 0 
        ? relevantChunks.map(c => `[SOURCE: ${c.source}]\n${c.text}`).join('\n\n---\n\n')
        : "No relevant internal data streams found.";

      const assistantId = (Date.now() + 1).toString();
      const initialAssistantMsg: ChatMessage = {
        id: assistantId, role: 'assistant', content: '', citations: Array.from(new Set(relevantChunks.map(c => c.source))), timestamp: Date.now(),
      };
      
      const updatedMessagesWithPlaceholder = [...newMessages, initialAssistantMsg];
      onMessagesUpdate(updatedMessagesWithPlaceholder);

      const stream = geminiService.generateRAGResponseStream(query, context, activeSession.messages.slice(-6), useSearch, strictMode);
      let fullContent = '';
      for await (const chunk of stream) {
        if (isLoading) setIsLoading(false);
        // Using .text property as per GenerateContentResponse guidelines
        fullContent += (chunk.text || '');
        onMessagesUpdate(updatedMessagesWithPlaceholder.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
      }

      // Auto-Read Trigger
      if (isAutoRead) {
        const { main } = parseReasoning(fullContent);
        speak(main, assistantId);
      }

    } catch (err: any) {
      onMessagesUpdate([...newMessages, { id: Date.now().toString(), role: 'assistant', content: `Neural Fault: ${err.message}`, timestamp: Date.now() }]);
    } finally { setIsLoading(false); }
  };

  return (
    <div className={`flex-1 flex flex-col relative h-full transition-all duration-700 overflow-hidden`}>
      {/* Dynamic Header */}
      <header className={`h-24 border-b flex items-center justify-between px-10 z-30 transition-all backdrop-blur-3xl ${isDark ? 'border-emerald-900/20 bg-zinc-950/60' : 'border-zinc-200 bg-white/90'}`}>
        <div className="flex items-center gap-6">
          {!isSidebarOpen && (
            <button onClick={toggleSidebar} className={`p-3 rounded-2xl transition-all transform hover:scale-110 active:scale-90 ${isDark ? 'text-zinc-400 hover:bg-emerald-500/10 hover:text-emerald-400' : 'text-zinc-600 hover:bg-zinc-100'}`}>
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          )}
          <div className={`p-3 rounded-2xl border-2 flex items-center justify-center transform hover:rotate-12 transition-all ${isDark ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-100'}`}>
            <svg className={`w-7 h-7 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className={`text-sm font-black uppercase tracking-[0.3em] truncate max-w-[250px] italic ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
              {activeSession?.title || 'Core Awaiting Command'}
            </h2>
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${indexReady ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-amber-500'}`} />
              <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>{indexReady ? 'Neural Link Optimized' : 'System Standby'}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className={`flex items-center gap-4 p-2 rounded-2xl border-2 transition-all relative ${isDark ? 'bg-zinc-900/60 border-emerald-900/20' : 'bg-zinc-100 border-zinc-200 shadow-inner'}`}>
            
            {/* Speech Controls Toggle */}
            <button 
              onClick={() => setShowSpeechSettings(!showSpeechSettings)}
              className={`p-2.5 rounded-2xl transition-all transform hover:scale-110 active:scale-90 flex items-center justify-center ${isDark ? 'text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10' : 'text-zinc-500 hover:text-emerald-600 hover:bg-white shadow-sm'}`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            </button>

            {/* Speech Settings Panel */}
            {showSpeechSettings && (
              <div className={`absolute top-full right-0 mt-4 w-72 p-6 rounded-[2rem] border-2 shadow-4xl animate-in fade-in zoom-in-95 duration-300 z-50 ${isDark ? 'bg-zinc-900 border-emerald-900/40' : 'bg-white border-zinc-100'}`}>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>Auto-Read</span>
                    <button onClick={() => setIsAutoRead(!isAutoRead)} className={`w-8 h-4 rounded-full transition-all relative ${isAutoRead ? 'bg-emerald-600' : 'bg-zinc-700'}`}>
                      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isAutoRead ? 'left-4.5' : 'left-0.5'}`} />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>Narrative Rate ({speechRate}x)</span>
                    <input type="range" min="0.5" max="2.0" step="0.1" value={speechRate} onChange={(e) => setSpeechRate(parseFloat(e.target.value))} className="w-full accent-emerald-500" />
                  </div>
                  <div className="space-y-2">
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>Voice Module</span>
                    <select 
                      value={selectedVoiceName} 
                      onChange={(e) => setSelectedVoiceName(e.target.value)}
                      className={`w-full p-2 rounded-xl text-xs font-bold border-2 focus:outline-none ${isDark ? 'bg-zinc-950 border-emerald-900/20 text-zinc-300' : 'bg-zinc-50 border-zinc-200 text-zinc-800'}`}
                    >
                      {voices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <button 
              onClick={toggleTheme}
              className={`p-2.5 rounded-2xl transition-all transform hover:scale-110 active:scale-90 flex items-center justify-center ${isDark ? 'text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10' : 'text-zinc-500 hover:text-emerald-600 hover:bg-white shadow-sm'}`}
            >
              {isDark ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
              )}
            </button>
            <div className={`w-px h-6 ${isDark ? 'bg-emerald-900/40' : 'bg-zinc-300'}`} />
            <div className="flex items-center gap-3 px-2">
              <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-zinc-600' : 'text-zinc-500'}`}>Strict Logic</span>
              <button onClick={() => setStrictMode(!strictMode)} className={`w-10 h-5 rounded-full transition-all relative transform active:scale-90 ${strictMode ? 'bg-emerald-600 shadow-md shadow-emerald-600/20' : 'bg-zinc-700'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-md ${strictMode ? 'left-5.5' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Conversation Thread */}
      <div className={`flex-1 overflow-y-auto px-10 py-10 space-y-16 scrollbar-hide`}>
        {(!activeSession || activeSession.messages.length === 0) && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-12 py-20">
            <div className="relative group">
              <div className={`absolute inset-0 blur-[120px] opacity-10 rounded-full animate-pulse transition-all duration-1000 group-hover:opacity-20 ${isDark ? 'bg-emerald-500' : 'bg-emerald-400'}`} />
              <div className={`w-32 h-32 rounded-[2.5rem] backdrop-blur-3xl flex items-center justify-center shadow-2xl rotate-45 group-hover:rotate-180 transition-all duration-1000 border-2 ${isDark ? 'bg-zinc-900/80 border-emerald-900/40' : 'bg-white border-zinc-100'}`}>
                <svg className={`w-16 h-16 -rotate-45 group-hover:-rotate-180 transition-all duration-1000 ${isDark ? 'text-emerald-500' : 'text-emerald-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                </svg>
              </div>
            </div>
            <div className="max-w-2xl space-y-6">
              <h3 className={`text-6xl font-black tracking-tighter uppercase italic ${isDark ? 'text-white' : 'text-zinc-900'}`}>Neural Sync Active</h3>
              {!activeSession ? (
                <button onClick={onNewChat} className="px-10 py-5 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-[0.3em] hover:bg-emerald-500 transition-all shadow-2xl shadow-emerald-600/30 hover:translate-y-[-4px] active:scale-95">Establish Neural Link</button>
              ) : (
                <p className={`text-xl font-medium leading-relaxed tracking-tight ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>The knowledge matrix is primed. Strict logic is {strictMode ? <span className="text-emerald-500 font-black underline underline-offset-8">ENABLED</span> : <span className="text-amber-500 font-black underline underline-offset-8">HEURISTIC</span>}.</p>
              )}
            </div>
          </div>
        )}

        {activeSession?.messages.map((msg, i) => {
          // Explicitly handle message parsing to avoid TypeScript property check issues in ternary
          let main = msg.content;
          if (msg.role === 'assistant') {
            const parsed = parseReasoning(msg.content);
            main = parsed.main;
          }
          
          return (
            <div key={msg.id} className={`flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-1000 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] relative overflow-hidden px-10 py-8 shadow-3xl transform transition-all hover:translate-y-[-2px] ${
                msg.role === 'user' 
                  ? 'bg-emerald-600 text-white rounded-[3rem] rounded-tr-none' 
                  : (isDark ? 'bg-zinc-900 border-2 border-emerald-900/20 text-zinc-100 rounded-[3rem] rounded-tl-none' : 'bg-white border-2 border-zinc-100 text-zinc-800 rounded-[3rem] rounded-tl-none')
              }`}>
                
                {/* Play Button for Assistant Messages */}
                {msg.role === 'assistant' && (
                  <button 
                    onClick={() => speak(main, msg.id)}
                    className={`absolute top-6 right-6 p-2 rounded-xl transition-all transform hover:scale-125 z-20 ${
                      currentlySpeakingId === msg.id 
                        ? 'text-emerald-500 animate-pulse bg-emerald-500/10' 
                        : (isDark ? 'text-zinc-500 hover:text-emerald-400' : 'text-zinc-400 hover:text-emerald-600')
                    }`}
                  >
                    {currentlySpeakingId === msg.id ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                    )}
                  </button>
                )}

                <div className={`prose prose-invert max-w-none text-xl leading-relaxed relative z-10 font-medium tracking-tight ${msg.role === 'user' ? 'text-white' : (isDark ? 'text-zinc-200' : 'text-zinc-900')}`}>
                  {main || (
                    <div className="flex flex-col gap-4">
                      <span className="text-xs font-black text-emerald-500 uppercase tracking-[0.4em] animate-pulse">Syncing Knowledge Fragments...</span>
                      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 animate-[loading_2s_infinite]" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {showRetrieved && lastRetrieved.length > 0 && (
          <div className={`rounded-[3.5rem] p-12 space-y-8 animate-in zoom-in-95 duration-700 border-2 shadow-2xl ${isDark ? 'bg-emerald-950/20 border-emerald-900/20' : 'bg-emerald-50 border-emerald-100'}`}>
            <div className="flex items-center justify-between px-4">
              <h4 className={`text-sm font-black uppercase tracking-[0.4em] ${isDark ? 'text-emerald-400' : 'text-emerald-900'}`}>Matrix Fragments</h4>
              <span className="text-[10px] font-mono text-emerald-500/40 font-bold uppercase tracking-[0.3em]">Protocol: Bio-BM25</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {lastRetrieved.map((chunk, i) => (
                <div key={i} className={`p-8 rounded-[2rem] border-2 transition-all transform hover:scale-[1.02] ${isDark ? 'bg-zinc-950/80 border-emerald-900/20 hover:border-emerald-500/40 shadow-xl' : 'bg-white border-zinc-200 hover:border-emerald-400 shadow-md'}`}>
                   <span className="text-[10px] font-mono text-zinc-600 uppercase block mb-4 tracking-widest">{chunk.source}</span>
                   <p className={`text-sm leading-relaxed font-bold italic tracking-tight line-clamp-6 ${isDark ? 'text-zinc-400' : 'text-zinc-700'}`}>
                     "{highlightText(chunk.text, lastQuery)}"
                   </p>
                </div>
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} className="h-10" />
      </div>

      {/* Input Stage */}
      <div className={`p-10 transition-all ${isDark ? 'bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent' : 'bg-white border-t-2 border-zinc-100 shadow-2xl'}`}>
        <form onSubmit={handleSend} className="max-w-5xl mx-auto relative group">
          <div className={`absolute -inset-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-[2.5rem] blur-xl opacity-0 group-focus-within:opacity-20 transition-all duration-1000`} />
          <div className={`relative border-2 rounded-[2.5rem] shadow-4xl overflow-hidden transition-all ${isDark ? 'bg-zinc-900 border-emerald-900/20 group-focus-within:border-emerald-500/40' : 'bg-zinc-50 border-zinc-200 focus-within:bg-white focus-within:border-emerald-400'}`}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={indexReady ? "Broadcast neural query..." : "Core offline. Sync data fragments..."}
              className={`w-full bg-transparent px-10 py-7 pr-28 focus:outline-none text-xl font-bold tracking-tight ${isDark ? 'text-zinc-100 placeholder-zinc-700' : 'text-zinc-900 placeholder-zinc-400'}`}
              disabled={isLoading || !indexReady || !activeSession}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading || !indexReady || !activeSession}
              className="absolute right-4 top-4 bottom-4 px-10 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white rounded-[1.8rem] transition-all shadow-xl shadow-emerald-600/20 active:scale-95 flex items-center transform hover:translate-x-1"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
          </div>
        </form>
      </div>
      
      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default ChatArea;
