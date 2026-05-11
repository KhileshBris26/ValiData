import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sparkles, Plus, X, ExternalLink, Folder, Settings as SettingsIcon, MessageSquare, Send, Table,
  ChevronRight, ChevronDown, Trash2, ArrowLeft, Loader2
} from 'lucide-react';
import axios from 'axios';
import { usePlatform } from '../context/PlatformContext';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api/v1';

interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  context?: string;
}

interface ChatTopic {
  id: string;
  title: string;
  messages: ChatMessage[];
}

const AIAgent: React.FC = () => {
  const navigate = useNavigate();
  const { platform } = usePlatform();
  const [isTyping, setIsTyping] = useState(false);
  const [showReviewChanges, setShowReviewChanges] = useState(false);
  const [testingRule, setTestingRule] = useState<any>(null);
  const [ruleInstances, setRuleInstances] = useState<any>([]);
  const [rules, setRules] = useState([
    {
      id: 'r1',
      name: 'AI Rule Email Completeness Check',
      description: 'This expression checks if the email attribute is either missing (null) or empty, meaning it has no characters.',
      when: '1  EMAIL is NULL or length(EMAIL) = 0',
      then: 'Not Complete',
      expanded: false,
      checked: false
    },
    {
      id: 'r2',
      name: 'AI Rule Approval Status Completeness Check',
      description: 'This expression checks if the approval status attribute is missing or null.',
      when: '1  APPROVAL_STATUS is NULL or APPROVAL_STATUS = \'\'',
      then: 'Incomplete Approval',
      expanded: false,
      checked: false
    },
    {
      id: 'r3',
      name: 'AI Rule Customer Name Uniqueness Check',
      description: 'This expression checks if the customer name attribute is unique across all transactions.',
      when: '1  count(CUSTOMER_NAME) over (partition by CUSTOMER_NAME) > 1',
      then: 'Duplicate Name',
      expanded: false,
      checked: false
    }
  ]);

  // Topics and Active Topic Management
  const [topics, setTopics] = useState<ChatTopic[]>([
    {
      id: '1',
      title: 'Based on deficiencies from ...',
      messages: [
        { id: 'm1', sender: 'user', text: 'Analyze existing DQ results and tell me the most critical issues.', context: 'BANK_TRANSACTIONS' },
        { id: 'm2', sender: 'agent', text: 'Based on your latest scan of the BANK_TRANSACTIONS table, the EMAIL column has a 32% failure rate for NULL checks. I recommend adding a mandatory format validation regex.' }
      ]
    }
  ]);

  const [activeTopicId, setActiveTopicId] = useState<string>('1');
  const [inputText, setInputText] = useState('');
  const [activeContext, setActiveContext] = useState<string | null>(() => {
    return sessionStorage.getItem('robin_active_context_table') || 'BANK_TRANSACTIONS';
  });
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);

  const activeTopic = topics.find(t => t.id === activeTopicId) || topics[0];


  const createNewTopic = () => {
    const newId = String(Date.now());
    const newTopic: ChatTopic = {
      id: newId,
      title: 'New Chat',
      messages: []
    };
    setTopics([newTopic, ...topics]);
    setActiveTopicId(newId);
    setInputText('');
    const context = sessionStorage.getItem('robin_active_context_table') || 'BANK_TRANSACTIONS';
    setActiveContext(context);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const messageText = textToSend || inputText;
    if (!messageText.trim()) return;

    const currentTopic = activeTopic;

    // Create the user message
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: messageText,
      context: activeContext || undefined
    };

    const updatedMessages = [...currentTopic.messages, userMsg];
    const updatedTitle = currentTopic.title === 'New Chat' ? messageText.substring(0, 30) + '...' : currentTopic.title;

    setTopics(topics.map(t => t.id === activeTopicId ? { ...t, title: updatedTitle, messages: updatedMessages } : t));
    setInputText('');
    setIsTyping(true);

    try {
      let credentials = null;
      const saved = sessionStorage.getItem('robin_credentials');
      if (saved) {
        credentials = JSON.parse(saved)[platform];
      }

      const res = await axios.post(`${API_BASE}/ai/chat`, {
        platform,
        messages: updatedMessages.map(m => ({ role: m.sender, text: m.text })),
        context_table: activeContext || undefined,
        credentials
      });

      const replyText = res.data.response || "I've analyzed the table structure and identified potential quality improvements. How would you like to proceed?";

      const agentMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'agent',
        text: replyText,
        context: activeContext || undefined
      };

      setTopics(prev => prev.map(t => t.id === activeTopicId ? { ...t, messages: [...t.messages, agentMsg] } : t));
    } catch (err) {
      console.error("AI Chat failed", err);
      // Fallback for demo/latency issues
      const fallbackMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'agent',
        text: "I'm currently analyzing your warehouse metadata. Based on the " + (activeContext || 'selected table') + " structure, I recommend starting with a Completeness check on your primary keys.",
        context: activeContext || undefined
      };
      setTopics(topics.map(t => t.id === activeTopicId ? { ...t, messages: [...updatedMessages, fallbackMsg] } : t));
    } finally {
      setIsTyping(false);
    }
  };

  const handleSuggestionClick = (suggestionText: string) => {
    handleSendMessage(suggestionText);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        width: '1100px',
        height: '800px',
        maxWidth: '95vw',
        maxHeight: '95vh',
        background: '#0B0F19',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Top Header of the Popup */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          background: '#0E1321'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={20} color="#c084fc" />
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#c084fc' }}>AI Agent</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
            <ExternalLink size={18} style={{ color: '#94a3b8', cursor: 'pointer' }} />
            <X 
              size={22} 
              style={{ color: '#94a3b8', cursor: 'pointer' }} 
              onClick={() => navigate(-1)}
            />
          </div>
        </div>

        {/* Content Area */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* Left Sidebar inside the Modal */}
          <div style={{
            width: '280px',
            background: '#090D16',
            borderRight: '1px solid rgba(255, 255, 255, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.5rem'
          }}>
            {/* New Topic Button */}
            <button 
              onClick={createNewTopic}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '0.75rem',
                padding: '0.75rem 1.25rem',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '8px',
                color: '#f8fafc',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.2s',
                marginBottom: '2rem'
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)')}
            >
              <Plus size={18} />
              <span>New topic</span>
            </button>

            {/* Past Conversations / History */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem', display: 'block' }}>
                Today
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {topics.map(t => (
                  <div 
                    key={t.id}
                    onClick={() => setActiveTopicId(t.id)}
                    style={{
                      padding: '0.65rem 0.75rem',
                      borderRadius: '6px',
                      background: activeTopicId === t.id ? 'rgba(192, 132, 252, 0.12)' : 'transparent',
                      color: activeTopicId === t.id ? '#c084fc' : '#94a3b8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.85rem',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    <MessageSquare size={14} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer Items in the Left Sidebar */}
            <div className="agent-sidebar-footer">
              <div className="sidebar-item" onClick={() => setShowPromptLibrary(true)}>
                <Folder size={18} />
                <span>Prompt library</span>
              </div>
              <div className="sidebar-item" onClick={() => setShowSettings(true)}>
                <SettingsIcon size={18} />
                <span>Settings</span>
              </div>
            </div>
          </div>

          {/* Right Main Panel with Chat Interaction */}
          <div style={{
            flex: 1,
            background: '#070A11',
            display: 'flex',
            flexDirection: 'column',
            padding: '2rem',
            overflowY: 'auto'
          }}>

            {activeTopic.messages.length === 0 ? (
              /* Zero State: What do you want to get done? */
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '2rem'
              }}>
                <h1 style={{ color: '#f8fafc', fontSize: '2rem', fontWeight: 600, margin: 0 }}>
                  What do you want to get done?
                </h1>

                {/* Rich Input TextArea with context */}
                <div style={{
                  width: '650px',
                  background: '#0C111C',
                  border: '1px solid rgba(192, 132, 252, 0.4)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)'
                }}>
                  {/* Active context badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      background: 'rgba(255, 255, 255, 0.04)',
                      padding: '0.35rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      color: '#94a3b8',
                      fontSize: '0.75rem'
                    }}>
                      <span>@</span>
                      <Table size={12} color="#c084fc" />
                      <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{activeContext || 'All tables'}</span>
                    </div>
                  </div>

                  {/* Message Input Box */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem' }}>
                    <textarea 
                      placeholder="Describe your task in detail. Use @ to add context."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: '#f8fafc',
                        fontFamily: 'inherit',
                        fontSize: '0.95rem',
                        lineHeight: 1.5,
                        resize: 'none',
                        height: '70px'
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />
                    <button 
                      onClick={() => handleSendMessage()}
                      style={{
                        background: '#c084fc',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        width: '36px',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'opacity 0.2s'
                      }}
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>

                {/* Suggestions Section */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.75rem',
                  maxWidth: '550px'
                }}>
                  {[
                    "Analyze catalog item relationships",
                    "Compare catalog item differences",
                    "Create SQL catalog item",
                    "Create DQ rules and apply to catalog item",
                    "Browse prompts"
                  ].map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSuggestionClick(s)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        color: '#94a3b8',
                        padding: '0.65rem 1.25rem',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.color = '#e2e8f0';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                        e.currentTarget.style.color = '#94a3b8';
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : testingRule ? (
              /* Testing rule view / playground */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '100%', overflowY: 'auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                    Test rule "{testingRule.name}"
                  </h2>
                  <button
                    onClick={() => setTestingRule(null)}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                  >
                    <X size={24} />
                  </button>
                </div>

                {/* Two Column Layout */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', flex: 1 }}>
                  
                  {/* Left Column - Logic Implementation */}
                  <div style={{
                    background: '#0D1321',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.25rem',
                    overflowY: 'auto'
                  }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                      Logic implementation
                    </h3>

                    {/* ATTRIBUTES Section */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>ATTRIBUTES</span>
                        <span style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', padding: '2px 6px', fontSize: '0.75rem', color: '#94a3b8' }}>1</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <select style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px', padding: '0.45rem 0.75rem', color: '#f8fafc', fontSize: '0.85rem' }}>
                          <option>Az String</option>
                        </select>
                        <input 
                          type="text" 
                          value="EMAIL" 
                          readOnly
                          style={{ flex: 1, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px', padding: '0.45rem 0.75rem', color: '#f8fafc', fontSize: '0.85rem' }} 
                        />
                        <button style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '0.35rem 0.75rem', color: '#cbd5e1', fontSize: '0.8rem', cursor: 'pointer' }}>
                          + Add Term
                        </button>
                        <button style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '0.35rem 0.75rem', color: '#cbd5e1', fontSize: '0.8rem', cursor: 'pointer' }}>
                          + Add attribute
                        </button>
                      </div>
                    </div>

                    {/* PARAMETERS Section */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>PARAMETERS</span>
                      <button style={{ alignSelf: 'start', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '0.35rem 0.75rem', color: '#cbd5e1', fontSize: '0.8rem', cursor: 'pointer' }}>
                        + Add parameter
                      </button>
                    </div>

                    {/* VARIABLES Section */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>VARIABLES</span>
                      <button style={{ alignSelf: 'start', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '0.35rem 0.75rem', color: '#cbd5e1', fontSize: '0.8rem', cursor: 'pointer' }}>
                        + Add variable
                      </button>
                    </div>

                    {/* Bottom Rule Code Panel */}
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.01)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.25)', borderRadius: '4px', padding: '2px 6px', fontSize: '0.75rem', color: '#f43f5e', fontWeight: 500 }}>1</span>
                          <span style={{ color: '#f8fafc', fontSize: '0.85rem', fontWeight: 500 }}>Email is missing</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(192, 132, 252, 0.1)', border: '1px solid rgba(192, 132, 252, 0.25)', borderRadius: '6px', padding: '0.25rem 0.65rem', color: '#c084fc', fontSize: '0.75rem', cursor: 'pointer' }}>
                            <Sparkles size={12} />
                            <span>Ask AI</span>
                          </button>
                          <button style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '0.25rem 0.5rem', color: '#cbd5e1', cursor: 'pointer' }}>
                            📄
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>WHEN</span>
                        <pre style={{
                          margin: 0,
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          borderRadius: '6px',
                          padding: '0.75rem',
                          fontSize: '0.8rem',
                          color: '#cbd5e1',
                          fontFamily: 'monospace'
                        }}>
                          {testingRule.when}
                        </pre>
                      </div>
                    </div>

                  </div>

                  {/* Right Column - Test rule Playground */}
                  <div style={{
                    background: '#0D1321',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.25rem',
                    overflowY: 'auto'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                        Test rule
                      </h3>
                      <select style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px', padding: '0.35rem 0.65rem', color: '#f8fafc', fontSize: '0.85rem' }}>
                        <option>Whole rule</option>
                      </select>
                    </div>

                    <button style={{ alignSelf: 'start', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '0.35rem 0.75rem', color: '#cbd5e1', fontSize: '0.8rem', cursor: 'pointer' }}>
                      ✨ Generate inputs
                    </button>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>EMAIL</span>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input 
                          type="text" 
                          placeholder="Type testing string here..."
                          defaultValue="STRING"
                          style={{ flex: 1, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px', padding: '0.45rem 0.75rem', color: '#f8fafc', fontSize: '0.85rem' }} 
                        />
                        <button style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <button style={{ alignSelf: 'start', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '0.35rem 0.75rem', color: '#cbd5e1', fontSize: '0.8rem', cursor: 'pointer' }}>
                        + New Row
                      </button>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '1rem', marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Message:</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.25)', borderRadius: '4px', padding: '4px 10px', fontSize: '0.85rem', color: '#f43f5e', fontWeight: 500 }}>
                        <span style={{ background: '#f43f5e', width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }} /> Email is missing
                      </span>
                    </div>

                  </div>

                </div>
              </div>
            ) : showReviewChanges ? (
              /* Review changes view */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '100%', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    onClick={() => setShowReviewChanges(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      fontWeight: 500
                    }}
                  >
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>

                  <button
                    onClick={() => setRules([])}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      fontWeight: 500
                    }}
                  >
                    <Trash2 size={16} />
                    <span>Delete all</span>
                  </button>
                </div>

                <div style={{
                  background: '#0D1321',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  overflowY: 'auto'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 80px', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                    <input 
                      type="checkbox" 
                      checked={rules.every(r => r.checked) && rules.length > 0}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setRules(rules.map(r => ({ ...r, checked })));
                      }}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>Rule</span>
                    <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, textAlign: 'right' }}>Status</span>
                  </div>

                  {rules.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>
                      No rules to review.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {rules.map((r) => (
                        <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '40px 24px 1fr 80px', alignItems: 'center' }}>
                            <input 
                              type="checkbox" 
                              checked={r.checked}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setRules(rules.map(rule => rule.id === r.id ? { ...rule, checked } : rule));
                              }}
                              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                            <div 
                              onClick={() => {
                                setRules(rules.map(rule => rule.id === r.id ? { ...rule, expanded: !rule.expanded } : rule));
                              }}
                              style={{ color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              {r.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </div>
                            <span 
                              onClick={() => navigate(`/rule/${r.name}`)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                borderRadius: '4px',
                                padding: '4px 10px',
                                fontSize: '0.85rem',
                                color: '#e9d5ff',
                                cursor: 'pointer',
                                justifySelf: 'start'
                              }}
                            >
                              {r.name} 📄
                            </span>
                            <span style={{
                              background: 'rgba(52, 211, 153, 0.1)',
                              border: '1px solid rgba(52, 211, 153, 0.15)',
                              borderRadius: '4px',
                              padding: '2px 8px',
                              fontSize: '0.75rem',
                              color: '#34d399',
                              fontWeight: 500,
                              textAlign: 'center',
                              justifySelf: 'end'
                            }}>
                              New
                            </span>
                          </div>

                          {r.expanded && (
                            <div style={{
                              marginLeft: '64px',
                              padding: '0.75rem',
                              background: 'rgba(255, 255, 255, 0.01)',
                              borderLeft: '2px solid #c084fc',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.75rem'
                            }}>
                              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.4 }}>
                                {r.description}
                              </p>
                              
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>WHEN</div>
                                <pre style={{
                                  margin: 0,
                                  background: 'rgba(255, 255, 255, 0.02)',
                                  border: '1px solid rgba(255, 255, 255, 0.05)',
                                  borderRadius: '6px',
                                  padding: '0.75rem',
                                  fontSize: '0.8rem',
                                  color: '#cbd5e1',
                                  fontFamily: 'monospace'
                                }}>
                                  {r.when}
                                </pre>
                                
                                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>THEN</div>
                                <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                                  {r.then}
                                </div>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                <button
                                  onClick={() => setTestingRule(r)}
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '6px',
                                    padding: '0.35rem 0.75rem',
                                    color: '#f8fafc',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Test rule
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rule Instances Section if there are rule instances */}
                {ruleInstances.length > 0 && (
                  <div style={{
                    background: '#0D1321',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    overflowY: 'auto'
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 80px', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                      <input 
                        type="checkbox" 
                        checked={ruleInstances.every((ri: any) => ri.checked) && ruleInstances.length > 0}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setRuleInstances(ruleInstances.map((ri: any) => ({ ...ri, checked })));
                        }}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                      <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>Rule Instance</span>
                      <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, textAlign: 'right' }}>Status</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {ruleInstances.map((ri: any) => (
                        <div key={ri.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '40px 24px 1fr 80px', alignItems: 'center' }}>
                            <input 
                              type="checkbox" 
                              checked={ri.checked}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setRuleInstances(ruleInstances.map((rule: any) => rule.id === ri.id ? { ...rule, checked } : rule));
                              }}
                              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                            <div 
                              onClick={() => {
                                setRuleInstances(ruleInstances.map((rule: any) => rule.id === ri.id ? { ...rule, expanded: !rule.expanded } : rule));
                              }}
                              style={{ color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              {ri.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </div>
                            <span 
                              onClick={() => navigate(`/rule/${ri.name}`)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                borderRadius: '4px',
                                padding: '4px 10px',
                                fontSize: '0.85rem',
                                color: '#e9d5ff',
                                cursor: 'pointer',
                                justifySelf: 'start'
                              }}
                            >
                              {ri.name} 📄 ➔ Az {ri.attribute}
                            </span>
                            <span style={{
                              background: 'rgba(52, 211, 153, 0.1)',
                              border: '1px solid rgba(52, 211, 153, 0.15)',
                              borderRadius: '4px',
                              padding: '2px 8px',
                              fontSize: '0.75rem',
                              color: '#34d399',
                              fontWeight: 500,
                              textAlign: 'center',
                              justifySelf: 'end'
                            }}>
                              New
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Blue bottom action banner for selections */}
                {(rules.filter(r => r.checked).length + ruleInstances.filter((ri: any) => ri.checked).length) > 0 && (
                  <div style={{
                    position: 'sticky',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: '#2563EB',
                    borderRadius: '8px',
                    padding: '0.75rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.15)',
                    marginTop: 'auto'
                  }}>
                    <button
                      onClick={() => {
                        setRules(rules.map(r => ({ ...r, checked: false })));
                        setRuleInstances(ruleInstances.map((ri: any) => ({ ...ri, checked: false })));
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.15)',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.45rem 1rem',
                        color: '#ffffff',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                      }}
                    >
                      <X size={16} />
                      <span>Clear selection</span>
                    </button>

                    <button
                      onClick={() => {
                        setRules(rules.filter(r => !r.checked));
                        setRuleInstances(ruleInstances.filter((ri: any) => !ri.checked));
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.15)',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.45rem 1rem',
                        color: '#ffffff',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                      }}
                    >
                      <Trash2 size={16} />
                      <span>Delete selected ({rules.filter(r => r.checked).length + ruleInstances.filter((ri: any) => ri.checked).length})</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Chat view when conversations have items */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>
                  {activeTopic.messages.map((m) => (
                    <div 
                      key={m.id} 
                      style={{
                        alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '75%',
                        background: m.sender === 'user' ? 'rgba(192, 132, 252, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                        padding: '0.9rem 1.25rem',
                        borderRadius: m.sender === 'user' ? '14px 14px 0 14px' : '14px 14px 14px 0',
                        border: m.sender === 'user' ? '1px solid rgba(192, 132, 252, 0.25)' : '1px solid rgba(255, 255, 255, 0.05)'
                      }}
                    >
                      {m.context && m.sender === 'user' && (
                        <div style={{
                          fontSize: '0.7rem',
                          color: '#a855f7',
                          marginBottom: '0.4rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}>
                          <Table size={10} />
                          <span>@{m.context}</span>
                        </div>
                      )}
                      <p style={{ margin: 0, color: '#f8fafc', fontSize: '0.95rem', lineHeight: 1.5 }}>
                        {m.text}
                      </p>
                    </div>
                  ))}
                  {isTyping && (
                    <div style={{
                      alignSelf: 'flex-start',
                      maxWidth: '75%',
                      background: 'rgba(255, 255, 255, 0.03)',
                      padding: '0.9rem 1.25rem',
                      borderRadius: '14px 14px 14px 0',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <Loader2 className="spinner" size={16} color="#94a3b8" />
                      <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>AI is thinking...</span>
                    </div>
                  )}
                </div>

                {/* Steps and Reasoning Section */}
                <div style={{ margin: '0 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span 
                      onClick={() => setShowSteps(!showSteps)}
                      style={{ color: '#c084fc', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
                    >
                      {showSteps ? 'Hide steps' : 'Show steps'}
                    </span>
                    <span 
                      onClick={() => setShowReasoning(!showReasoning)}
                      style={{ color: '#c084fc', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
                    >
                      {showReasoning ? 'Hide reasoning' : 'Show reasoning'}
                    </span>
                  </div>

                  {showSteps && (
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      padding: '1rem',
                      color: '#e2e8f0',
                      fontSize: '0.85rem',
                      lineHeight: 1.6
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#c084fc', marginBottom: '0.5rem' }}>
                        <Sparkles size={14} />
                        <span style={{ fontWeight: 600 }}>Thinking</span>
                      </div>
                      <p style={{ margin: 0 }}>Processing rules constraint definitions down to the source warehouse natively via Zero-Data movement architecture. Analyzing existing Data Trust index.</p>
                    </div>
                  )}

                  {showReasoning && (
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      padding: '1.25rem',
                      color: '#e2e8f0',
                      fontSize: '0.85rem',
                      lineHeight: 1.6,
                      maxHeight: '400px',
                      overflowY: 'auto',
                      marginBottom: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1rem'
                    }}>
                      <div>
                        <strong style={{ color: '#f8fafc' }}>Thought:</strong>
                      </div>

                      <div style={{ color: '#94a3b8' }}>
                        Execution 1: I successfully fetched the attributes of <span style={{ color: '#c084fc' }}>@{activeContext || 'SELECTED_TABLE'}</span>. Dynamic profiling has identified all attributes in the source warehouse.
                      </div>

                      <div style={{ color: '#94a3b8' }}>
                        <strong style={{ color: '#f8fafc' }}>State:</strong><br />
                        I have a clear understanding of the structure of <span style={{ color: '#c084fc' }}>@{activeContext || 'BANK_TRANSACTIONS'}</span> and the existing rules assigned to its attributes. However, I still need to identify the specific deficiencies in the data quality score to propose impactful DQ rules.
                      </div>

                      <div style={{ color: '#94a3b8' }}>
                        <strong style={{ color: '#f8fafc' }}>Plan:</strong>
                        <ol style={{ margin: '0.25rem 0 0 1.25rem', padding: 0, color: '#94a3b8' }}>
                          <li>Attempt to fetch any available profiling data or data quality reports for <span style={{ color: '#c084fc' }}>@{activeContext || 'BANK_TRANSACTIONS'}</span> to identify existing deficiencies.</li>
                          <li>Analyze the deficiencies to determine the most impactful DQ rules that can be created.</li>
                          <li>Create new DQ rules based on the identified deficiencies.</li>
                          <li>Return the list of proposed DQ rules to the user.</li>
                        </ol>
                      </div>

                      <div style={{ color: '#94a3b8' }}>
                        <strong style={{ color: '#f8fafc' }}>Next step:</strong><br />
                        I will attempt to fetch any available profiling data or data quality reports for <span style={{ color: '#c084fc' }}>@{activeContext || 'BANK_TRANSACTIONS'}</span> to identify existing deficiencies. This will help in understanding the current data quality issues.
                      </div>

                      <div style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '6px',
                        padding: '0.75rem',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        color: '#a78bfa'
                      }}>
                        <strong style={{ color: '#f8fafc', fontFamily: 'sans-serif' }}>Debug (ToolStep)</strong>
                        <pre style={{ margin: '0.5rem 0 0 0', whiteSpace: 'pre-wrap', color: '#cbd5e1' }}>{`{
  "step": {
    "step_id": "019a0cdc-5bc7-700c-850c-ae0f88e4b089",
    "step_class": "ToolStep",
    "parent_task_id": "019a0cdc-2f80-7a9b-8a7c-4bf85a5c3433",
    "referenced_object_names": [
       "Reference(catalog_item)"
    ],
    "timestamp": "2025-10-22T16:59:13.773Z",
    "description": "Fetch attributes of Reference(catalog_item) to understand its structure.",
    "tool_name": "FetchCatalogItemAttributesTool"
  }
}`}</pre>
                      </div>

                      <div style={{ color: '#94a3b8' }}>
                        <strong style={{ color: '#f8fafc' }}>Tool Result Review:</strong><br />
                        Execution 1: I successfully fetched the profiling data for <span style={{ color: '#c084fc' }}>@{activeContext || 'BANK_TRANSACTIONS'}</span>. The profiling data provides insights into the data quality of each attribute, including null counts, distinct counts, unique counts, and patterns. Notably, the EMAIL attribute has a high null count (535 out of 1678), and the APPROVAL_STATUS attribute has a significant number of null values (560 out of 1678). These deficiencies suggest potential areas for improvement in data quality.
                      </div>

                      <div style={{ color: '#94a3b8' }}>
                        <strong style={{ color: '#f8fafc' }}>State:</strong><br />
                        I have identified specific deficiencies in the data quality of <span style={{ color: '#c084fc' }}>@{activeContext || 'BANK_TRANSACTIONS'}</span> based on the profiling data. The EMAIL and APPROVAL_STATUS attributes have high null counts, indicating a need for completeness checks. Additionally, the CUSTOMER_NAME attribute has non-unique values, suggesting a need for uniqueness checks.
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                    <span 
                      onClick={() => setShowReviewChanges(true)}
                      style={{ color: '#94a3b8', fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      <span style={{ color: '#c084fc' }}>•</span> Review changes ({rules.length + ruleInstances.length})
                    </span>
                  </div>
                </div>

                {/* Bottom Input Field for continuing active chat */}
                <div style={{
                  background: '#0C111C',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '12px',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '0.75rem'
                }}>
                  <textarea 
                    placeholder="Ask another question..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: '#f8fafc',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: 1.5,
                      resize: 'none',
                      height: '50px'
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <button 
                    onClick={() => handleSendMessage()}
                    style={{
                      background: '#c084fc',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      width: '36px',
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
      {/* Prompt Library Overlay */}
      <PromptLibrary isOpen={showPromptLibrary} onClose={() => setShowPromptLibrary(false)} onSelect={(p: string) => setInputText(p)} />
      
      {/* Settings Overlay */}
      <AgentSettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
};

// --- New Components ---

const PromptLibrary = ({ isOpen, onClose, onSelect }: any) => {
  if (!isOpen) return null;
  const prompts = [
    { title: "PII Discovery", text: "Identify all columns containing sensitive PII data and suggest masking rules." },
    { title: "Format Validation", text: "Check if the EMAIL and PHONE columns follow standard ISO formats." },
    { title: "Outlier Analysis", text: "Find statistical anomalies in the numeric columns of this table." }
  ];
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
      <div className="glass-panel" style={{ width: '400px', padding: '24px', background: '#1e293b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#f8fafc' }}>Prompt Library</h3>
          <X size={20} style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={onClose} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {prompts.map((p, i) => (
            <div key={i} onClick={() => { onSelect(p.text); onClose(); }} style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.9rem' }}>{p.title}</div>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '4px' }}>{p.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const AgentSettings = ({ isOpen, onClose }: any) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
      <div className="glass-panel" style={{ width: '400px', padding: '24px', background: '#1e293b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#f8fafc' }}>AI Agent Settings</h3>
          <X size={20} style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={onClose} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#f8fafc', fontSize: '0.9rem' }}>Deep Reasoning Mode</span>
            <input type="checkbox" defaultChecked />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#f8fafc', fontSize: '0.9rem' }}>Column Context Awareness</span>
            <input type="checkbox" defaultChecked />
          </div>
          <button className="btn-small" style={{ marginTop: '12px', width: '100%', background: '#6366f1', color: 'white', border: 'none', padding: '10px', borderRadius: '6px' }} onClick={onClose}>Save Settings</button>
        </div>
      </div>
    </div>
  );
};

export default AIAgent;
