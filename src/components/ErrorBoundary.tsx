import { Component, type ReactNode } from 'react'

// App-wide safety net. Without this, any uncaught error thrown while rendering a
// page tears down the whole React tree and leaves the user staring at a blank
// background. Here we catch it and show a friendly recovery card instead.
interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // Surface it in the console for debugging; the UI stays friendly.
    console.error('Caught by ErrorBoundary:', error)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={{
        minHeight: '100dvh', background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px',
      }}>
        <div className="glass" style={{ width: '100%', maxWidth: 400, padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⛳️</div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 26, letterSpacing: 1.5, color: 'var(--tx1)', marginBottom: 8 }}>
            That one's in the rough
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--tx3)', lineHeight: 1.6, marginBottom: 22 }}>
            Something hit a snag loading this page. Give it another swing — if it keeps happening, let the admin know.
          </div>
          <button onClick={() => { this.setState({ error: null }); window.location.href = '/' }}
            className="btn-gold pressable" style={{ width: '100%', justifyContent: 'center', minHeight: 48 }}>
            Back to the clubhouse
          </button>
          <button onClick={() => window.location.reload()}
            style={{ background: 'none', border: 'none', color: 'var(--tx4)', fontSize: 13, cursor: 'pointer', marginTop: 14 }}>
            Reload the page
          </button>
        </div>
      </div>
    )
  }
}
