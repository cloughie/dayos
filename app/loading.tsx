export default function Loading() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#09090b',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
      }}
    >
      <img
        src="/apple-touch-icon.png"
        alt="DayOS"
        style={{ width: '72px', height: '72px', borderRadius: '16px' }}
      />
      <span
        style={{
          color: '#a1a1aa',
          fontSize: '13px',
          letterSpacing: '0.06em',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        DayOS
      </span>
    </div>
  )
}
