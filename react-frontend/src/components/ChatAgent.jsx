import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, Bot, User, Key, Mic, MicOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ChatAgent() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "I'm the Data Pigeon AI. I now have native integration with Google Gemini! Please drop your API Key below. Ask me to prioritize maintenance or identify high-risk nodes." }
  ]);
  const [input, setInput] = useState('');
  const [apiKey, setApiKey] = useState(() => {
    return import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('gemini_api_key') || '';
  });
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (apiKey && apiKey !== import.meta.env.VITE_GEMINI_API_KEY) {
      localStorage.setItem('gemini_api_key', apiKey);
    } else if (!apiKey) {
      localStorage.removeItem('gemini_api_key');
    }
  }, [apiKey]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const toggleListen = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev ? prev + ' ' + transcript : transcript);
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post('http://localhost:8000/api/chat', {
        message: userMsg,
        api_key: apiKey || null
      });
      const data = response.data;
      if (data.reply) {
        // Legacy fallback format
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message, cards: data.cards || [] }]);
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: error.response?.data?.detail || "Sorry, I lost connection to the predictive backend model or your API key was rejected."
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-[#F7F4EB] border border-[#DBD6C9] rounded-md shadow-xl overflow-hidden">
      <div className="p-3 bg-[#EBE7DE]/80 border-b border-[#C7BFA5] flex flex-col gap-3">
        <div className="font-bold text-warm-900 flex items-center gap-2">
          <Bot size={18} className="text-[#D16E1E]" /> Triaging Agent
        </div>
        <div className="flex items-center gap-2 bg-[#EBE7DE]/80 border border-[#C7BFA5] rounded-lg px-3 py-1.5 opacity-80 hover:opacity-100 transition-opacity">
          <Key size={14} className="text-[#9F9677]" />
          <input
            type="password"
            placeholder="Google GenAI API Key (Optional)..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="bg-transparent border-none text-xs text-warm-[#776F5B] w-full focus:outline-none placeholder-slate-600 font-mono"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] rounded-lg p-3 text-sm flex gap-2 ${msg.role === 'user'
              ? 'bg-[#E57A22]/30 border border-[#FB923C]/50 text-[#635B4D]'
              : 'bg-[#EBE7DE]/80 border border-[#C7BFA5] text-warm-[#635B4D]'
              }`}>
              <div className="mt-0.5 opacity-70">
                {msg.role === 'user' ? <User size={14} /> : <Bot size={14} className="text-[#D16E1E]" />}
              </div>
              <div className="leading-relaxed whitespace-pre-wrap flex-1">{msg.content}</div>
            </div>

            {msg.cards && msg.cards.length > 0 && (
              <div className="mt-2 w-[85%] space-y-2">
                {msg.cards.map((card, idx) => (
                  <div key={idx} className="bg-[#EBE7DE]/80 border border-[#C7BFA5] rounded-md p-3 text-sm shadow-md">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-warm-[#635B4D] text-xs">{card.station_name || card.name}</span>
                      <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">{card.risk_score}</span>
                    </div>
                    <div className="text-[10px] text-warm-[#635B4D] mb-1">{card.city}</div>
                    <div className="text-[10px] text-amber-400/90 font-medium mb-1">Issue: {card.reason}</div>
                    {card.details && <div className="text-[10px] text-warm-[#635B4D]">{card.details}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#EBE7DE]/80 border border-[#C7BFA5] text-warm-[#635B4D] rounded-lg p-3 text-sm flex items-center gap-2">
              <div className="animate-pulse flex gap-1">
                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full"></div>
                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animation-delay-200"></div>
                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animation-delay-400"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="p-3 bg-[#EBE7DE]/80 border-t border-[#C7BFA5] flex gap-2 items-center">
        <button
          type="button"
          onClick={toggleListen}
          className={`p-2 rounded-lg transition-colors border ${isListening ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 animate-pulse' : 'bg-[#EBE7DE]/80 text-warm-[#635B4D] border-[#C7BFA5] hover:bg-[#EBE7DE]/80'}`}
          title="Voice Input"
        >
          {isListening ? <Mic size={16} /> : <MicOff size={16} />}
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isListening ? "Listening..." : "Ask Data Pigeon..."}
          className="flex-1 bg-[#EBE7DE]/80 border border-[#C7BFA5] rounded-lg px-3 py-2 text-sm text-warm-[#635B4D] focus:outline-none focus:border-peach-[#D16E1E] transition-colors placeholder-slate-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-[#D16E1E] hover:bg-[#D16E1E]/80 disabled:opacity-50 disabled:hover:bg-[#D16E1E] text-black p-2 rounded-lg transition-colors"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
