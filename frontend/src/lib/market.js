export function getMarketStatus(now = new Date()) {
  // BRVM: Africa/Abidjan = UTC+0 (GMT), Monday-Friday
  const abidjan = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 0 * 3600000)
  const day = abidjan.getUTCDay()
  const minutes = abidjan.getUTCHours() * 60 + abidjan.getUTCMinutes()

  if (day === 0 || day === 6) return { isOpen: false, label: 'closed' }
  if (minutes < 9 * 60) return { isOpen: false, label: 'preopen' }
  if (minutes >= 17 * 60 + 30) return { isOpen: false, label: 'postclose' }
  return { isOpen: true, label: 'open' }
}
