// ErrorBoundary — stops one bad render (e.g. a malformed date) from blanking the
// whole app. React error boundaries must be class components.
import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Keep a breadcrumb in the console for debugging; no external logging.
    console.error('Couple\'s Hub crashed:', error, info)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          maxWidth: 440, margin: '18vh auto', padding: '28px 26px', textAlign: 'center',
          fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif', color: '#2b3a2b',
        }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🌿</div>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Something hiccuped</h1>
          <p style={{ color: '#5c665c', fontSize: 14, lineHeight: 1.5, margin: '0 0 18px' }}>
            The app hit an unexpected snag and stopped rendering. Your data is safe — try again,
            and if it keeps happening, reload the page.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={this.reset} style={btn(true)}>Try again</button>
            <button onClick={() => location.reload()} style={btn(false)}>Reload</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function btn(primary) {
  return {
    padding: '9px 18px', borderRadius: 999, cursor: 'pointer', fontSize: 14,
    border: primary ? 'none' : '1px solid #cdd4cd',
    background: primary ? '#3f8f66' : 'transparent',
    color: primary ? '#fff' : '#3f8f66',
  }
}
