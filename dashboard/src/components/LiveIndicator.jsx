export default function LiveIndicator({ readyState }) {
  const live = readyState === 1
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative w-3 h-3 flex items-center justify-center">
        <div className={`w-2.5 h-2.5 rounded-full ${live ? 'bg-green-400 pulse-live' : 'bg-slate-600'}`} />
      </div>
      <div className="flex flex-col leading-none">
        <span className={`text-[11px] font-bold tracking-widest ${live ? 'text-green-400' : 'text-slate-500'}`}>
          {live ? 'LIVE' : 'RECONNECTING'}
        </span>
        <span className="text-[9px] text-slate-600 tracking-wider">
          {live ? 'SENTINEL ACTIVE' : 'WAITING...'}
        </span>
      </div>
    </div>
  )
}
