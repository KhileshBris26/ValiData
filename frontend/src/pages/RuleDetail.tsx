import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Edit2, RefreshCw, Plus, Users, ArrowLeft } from 'lucide-react';

const RuleDetail: React.FC = () => {
  const { ruleName } = useParams<{ ruleName: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Overview');

  const decodedRuleName = decodeURIComponent(ruleName || 'AI Rule Email Completeness Check');

  return (
    <div style={{ padding: '2rem', minHeight: '100vh', background: '#090D16', color: '#f8fafc' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button 
          onClick={() => navigate(-1)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
          {decodedRuleName}
        </h1>
      </div>

      {/* Top Tabs Bar */}
      <div style={{
        display: 'flex',
        gap: '2.5rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        marginBottom: '2rem'
      }}>
        {['Overview', 'Implementation', 'Occurrence', 'History'].map(tab => (
          <div 
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              paddingBottom: '0.75rem',
              color: activeTab === tab ? '#c084fc' : '#94a3b8',
              borderBottom: activeTab === tab ? '2px solid #c084fc' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.95rem'
            }}
          >
            {tab}
          </div>
        ))}
      </div>

      {/* Main Content Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        
        {/* Left Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Description Card */}
          <div style={{
            background: '#0B111E',
            border: '1px solid rgba(255, 255, 255, 0.03)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc', marginTop: 0, marginBottom: '0.75rem' }}>
              Description
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
              This expression checks if the attribute is either missing or has an invalid structure, meaning it has no characters or incorrect values.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '0.4rem 0.85rem', color: '#f8fafc', cursor: 'pointer', fontSize: '0.85rem' }}>
                <Edit2 size={14} />
                <span>Edit</span>
              </button>
              <button style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '0.4rem 0.85rem', color: '#f8fafc', cursor: 'pointer', fontSize: '0.85rem' }}>
                <RefreshCw size={14} />
                <span>Regenerate</span>
              </button>
            </div>
          </div>

          {/* Glossary Terms Card */}
          <div style={{
            background: '#0B111E',
            border: '1px solid rgba(255, 255, 255, 0.03)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc', marginTop: 0, marginBottom: '0.75rem' }}>
              Glossary terms
            </h3>
            <button style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '0.4rem 0.85rem', color: '#f8fafc', cursor: 'pointer', fontSize: '0.85rem' }}>
              <Plus size={14} />
              <span>Add Term</span>
            </button>
          </div>

          {/* General Information Card */}
          <div style={{
            background: '#0B111E',
            border: '1px solid rgba(255, 255, 255, 0.03)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc', marginTop: 0, marginBottom: '1rem' }}>
              General information
            </h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Rule definition source</span>
              <span style={{ color: '#f8fafc', fontSize: '0.9rem' }}>-</span>
            </div>
          </div>
        </div>

        {/* Right Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Stewardship Card */}
          <div style={{
            background: '#0B111E',
            border: '1px solid rgba(255, 255, 255, 0.03)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '220px'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc', margin: 0, width: '100%', textAlign: 'left' }}>
              Stewardship
            </h3>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', textAlign: 'center' }}>
              <Users size={28} color="#64748b" style={{ opacity: 0.5 }} />
              <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 500 }}>
                Who is responsible for this asset?
              </span>
              <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                Assigning stewardship is recommended.
              </span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default RuleDetail;
