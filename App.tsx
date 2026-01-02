
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import { ChatSession, ChatMessage } from './types';

const App: React.FC = () => {
  const [indexReady, setIndexReady] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Load history and preferences from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('apex_rag_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSessions(parsed);
        if (parsed.length > 0) setActiveSessionId(parsed[0].id);
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
    const savedTheme = localStorage.getItem('apex_theme') as 'dark' | 'light';
    if (savedTheme) setTheme(savedTheme);
  }, []);

  // Persist history and theme
  useEffect(() => {
    localStorage.setItem('apex_rag_history', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('apex_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const activeSession = sessions.find(s => s.id === activeSessionId);

  const createNewChat = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'New Bio-Sync Session',
      messages: [],
      lastTimestamp: Date.now()
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newId);
  };

  const updateActiveSession = (messages: ChatMessage[]) => {
    if (!activeSessionId) return;
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        const firstUserMsg = messages.find(m => m.role === 'user');
        return {
          ...s,
          messages,
          lastTimestamp: Date.now(),
          title: firstUserMsg ? firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '') : s.title
        };
      }
      return s;
    }));
  };

  const deleteSession = (id: string) => {
    if (!window.confirm("Confirm deletion of this neural log?")) return;
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) setActiveSessionId(null);
  };

  const importSessions = (importedData: any) => {
    try {
      let newSessions: ChatSession[] = [];
      if (Array.isArray(importedData)) {
        newSessions = importedData;
      } else if (importedData.id && importedData.messages) {
        newSessions = [importedData];
      } else {
        throw new Error("Invalid format");
      }

      setSessions(prev => {
        const existingIds = new Set(prev.map(s => s.id));
        const filteredNew = newSessions.filter(s => !existingIds.has(s.id));
        return [...filteredNew, ...prev];
      });

      if (newSessions.length > 0) setActiveSessionId(newSessions[0].id);
    } catch (e) {
      alert("Import failed: Matrix corruption.");
    }
  };

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <div className={`flex h-screen w-full transition-colors duration-700 font-sans selection:bg-emerald-500/40 overflow-hidden text-lg ${theme === 'dark' ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'}`}>
      <Sidebar 
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        onIndexUpdated={() => setIndexReady(true)} 
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewChat={createNewChat}
        onDeleteSession={deleteSession}
        onImportSessions={importSessions}
        theme={theme}
      />
      <main className={`flex-1 flex flex-col min-w-0 relative transition-all duration-700 ${theme === 'dark' ? 'bg-[radial-gradient(circle_at_top_right,_#064e3b33,_#020617_70%)]' : 'bg-white'}`}>
        <ChatArea 
          indexReady={indexReady} 
          activeSession={activeSession}
          onMessagesUpdate={updateActiveSession}
          onNewChat={createNewChat}
          isSidebarOpen={isSidebarOpen}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      </main>
    </div>
  );
};

export default App;
