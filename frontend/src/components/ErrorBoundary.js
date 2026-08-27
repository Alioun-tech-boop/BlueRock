import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, error: err }
  }
  componentDidCatch(err, info) {
    console.error('[BlueRock ErrorBoundary]', err, info?.componentStack || '')
  }
  componentDidUpdate(prevProps) {
    if (prevProps.children !== this.props.children && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null })
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, background:'#0a0a0a', color:'#fff', padding:24, fontFamily:'Inter, sans-serif', textAlign:'center' }}>
          <h2 style={{ fontSize:28, fontWeight:700, letterSpacing:-0.02 }}>Erreur technique</h2>
          <p style={{ color:'#8b8b8b', fontSize:15, maxWidth:380, lineHeight:1.55 }}>
            Une erreur s'est produite. Essayez de recharger la page, ou revenez plus tard.
          </p>
          <button onClick={() => { window.location.reload() }} style={{ padding:'10px 22px', borderRadius:12, border:'none', background:'#18C27C', color:'#00130a', fontWeight:700, fontSize:14, cursor:'pointer' }}>
            Recharger
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
