import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { motion } from 'framer-motion';
import { Cpu, Mail, Lock } from 'lucide-react';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const { error } = isSignUp 
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      alert(error.message);
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      }
    });
    if (error) alert(error.message);
  };

  return (
    <div className="auth-container" style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#050505',
      color: '#0ff',
      fontFamily: 'Orbitron, sans-serif'
    }}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="auth-card" 
        style={{
          padding: '40px',
          background: 'rgba(0, 240, 255, 0.05)',
          border: '1px solid #0ff',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 0 20px rgba(0, 240, 255, 0.2)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <Cpu size={48} style={{ marginBottom: '10px' }} />
          <h2 style={{ letterSpacing: '2px' }}>J.A.R.V.I.S. AUTH</h2>
          <p style={{ fontSize: '0.8rem', color: '#888' }}>SECURE ACCESS PROTOCOL</p>
        </div>

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div className="form-group">
            <label style={{ fontSize: '0.7rem', marginBottom: '5px', display: 'block' }}>USER IDENTIFIER (EMAIL)</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 10px 10px 35px',
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid rgba(0,240,255,0.3)',
                  color: '#fff',
                  borderRadius: '4px'
                }}
                required 
              />
            </div>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.7rem', marginBottom: '5px', display: 'block' }}>SECURITY KEY (PASSWORD)</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 10px 10px 35px',
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid rgba(0,240,255,0.3)',
                  color: '#fff',
                  borderRadius: '4px'
                }}
                required 
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            style={{
              marginTop: '10px',
              padding: '12px',
              background: '#0ff',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 'bold',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}
          >
            {loading ? 'PROCESSING...' : (isSignUp ? 'INITIALIZE ACCOUNT' : 'ENGAGE ACCESS')}
          </button>
        </form>

        <div style={{ margin: '20px 0', textAlign: 'center', fontSize: '0.8rem', color: '#888' }}>
          OR USE CLOUD LINK
        </div>

        <button 
          onClick={handleGoogleLogin}
          style={{
            width: '100%',
            padding: '10px',
            background: 'transparent',
            color: '#0ff',
            border: '1px solid #0ff',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" style={{ width: '16px' }} />
          LINK VIA GOOGLE
        </button>

        <p 
          onClick={() => setIsSignUp(!isSignUp)}
          style={{ 
            marginTop: '20px', 
            textAlign: 'center', 
            fontSize: '0.75rem', 
            cursor: 'pointer',
            color: '#888'
          }}
        >
          {isSignUp ? 'ALREADY REGISTERED? LOG IN' : 'NEW OPERATOR? REGISTER HERE'}
        </p>
      </motion.div>
    </div>
  );
}
