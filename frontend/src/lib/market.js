export function getMarketStatus(now = new Date()) {
  // BRVM: Africa/Abidjan = UTC+0, Lun-Ven 09:00-17:30
  // Utilise Intl pour éviter les approximations getTimezoneOffset (DST)
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Abidjan',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(now)
    const get = (t) => parts.find(p => p.type === t)?.value
    const weekday = get('weekday') // Mon, Tue...
    const isWeekend = weekday === 'Sat' || weekday === 'Sun'
    if (isWeekend) return { isOpen: false, label: 'closed' }
    const h = parseInt(get('hour'), 10)
    const m = parseInt(get('minute'), 10)
    const minutes = h * 60 + m
    if (minutes < 9 * 60) return { isOpen: false, label: 'preopen' }
    if (minutes >= 17 * 60 + 30) return { isOpen: false, label: 'postclose' }
    return { isOpen: true, label: 'open' }
  } catch {
    // Fallback: UTC
    const day = now.getUTCDay()
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes()
    if (day === 0 || day === 6) return { isOpen: false, label: 'closed' }
    if (minutes < 9 * 60) return { isOpen: false, label: 'preopen' }
    if (minutes >= 17 * 60 + 30) return { isOpen: false, label: 'postclose' }
    return { isOpen: true, label: 'open' }
  }
}
