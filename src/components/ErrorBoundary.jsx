import React from 'react';

const DEFAULT_LOCAL_STORAGE_KEYS = ['cb_node_autosave_v1'];
const DEFAULT_SESSION_STORAGE_KEYS = ['cb_force_new_run_v1'];
const MONO = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('CardBattler crashed at runtime.', error, info);
  }

  reloadApp = () => {
    if (typeof window === 'undefined') return;
    window.location.reload();
  };

  clearRunAndReload = () => {
    if (typeof window === 'undefined') return;
    const localStorageKeys = this.props.localStorageKeys || DEFAULT_LOCAL_STORAGE_KEYS;
    const sessionStorageKeys = this.props.sessionStorageKeys || DEFAULT_SESSION_STORAGE_KEYS;
    for (const key of localStorageKeys) {
      window.localStorage.removeItem(key);
    }
    for (const key of sessionStorageKeys) {
      window.sessionStorage.removeItem(key);
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const message = String(this.state.error?.message || 'Unknown runtime error');

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background:
            'radial-gradient(circle at top, rgba(0,240,255,0.12), transparent 42%), #080a0f',
          color: '#e0e0e0',
        }}
      >
        <div
          style={{
            width: 'min(100%, 680px)',
            padding: '28px',
            borderRadius: '20px',
            border: '1px solid rgba(255, 78, 78, 0.4)',
            background: 'rgba(10, 14, 20, 0.94)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: '#ff8b7a',
              marginBottom: '12px',
            }}
          >
            RUNTIME RECOVERY
          </div>
          <h1
            style={{
              margin: '0 0 10px',
              fontSize: '28px',
              fontFamily: MONO,
              color: '#ffffff',
            }}
          >
            The current run crashed.
          </h1>
          <p
            style={{
              margin: '0 0 18px',
              color: '#a9b3c4',
              lineHeight: 1.6,
            }}
          >
            The app hit an unexpected JavaScript error. You can try a plain reload first, or clear the
            active run snapshot and reload if the crash keeps looping.
          </p>
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              fontFamily: MONO,
              fontSize: '12px',
              color: '#ffb2a8',
              marginBottom: '20px',
              wordBreak: 'break-word',
            }}
          >
            {message}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <button
              onClick={this.reloadApp}
              style={{
                border: 'none',
                borderRadius: '999px',
                padding: '12px 18px',
                background: '#00f0ff',
                color: '#031219',
                fontFamily: MONO,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Reload App
            </button>
            <button
              onClick={this.clearRunAndReload}
              style={{
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: '999px',
                padding: '12px 18px',
                background: 'transparent',
                color: '#ffffff',
                fontFamily: MONO,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Clear Run And Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
