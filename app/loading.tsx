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
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          backgroundColor: '#6366f1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="11" cy="11" r="4" fill="white" fillOpacity="0.9" />
          <circle cx="11" cy="4" r="2" fill="white" fillOpacity="0.5" />
          <circle cx="11" cy="18" r="2" fill="white" fillOpacity="0.5" />
          <circle cx="4" cy="11" r="2" fill="white" fillOpacity="0.5" />
          <circle cx="18" cy="11" r="2" fill="white" fillOpacity="0.5" />
        </svg>
      </div>
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
