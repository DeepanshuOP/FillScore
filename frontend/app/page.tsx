'use client'

export default function Home() {
  return (
    <div style={{ 
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem'
    }}>
      <p style={{ 
        fontFamily: 'var(--font-playfair)', 
        fontStyle: 'italic',
        fontSize: '2rem', 
        color: '#f5f5f0' 
      }}>
        Playfair Display Italic
      </p>
      <p style={{ 
        fontFamily: 'var(--font-inter)', 
        fontSize: '1rem', 
        color: '#a78b71' 
      }}>
        Inter Regular
      </p>
      <p style={{ 
        fontFamily: 'var(--font-mono)', 
        fontSize: '0.85rem', 
        color: '#666660',
        letterSpacing: '0.2em'
      }}>
        JETBRAINS MONO
      </p>
    </div>
  )
}
