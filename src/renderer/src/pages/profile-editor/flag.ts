// Country code → flag emoji. Small enough to be a constant; lives in
// its own file so component files can import it without breaking
// react-refresh (fast-refresh requires component-only exports).

const FLAG: Record<string, string> = {
  US: '🇺🇸',
  GB: '🇬🇧',
  DE: '🇩🇪',
  IN: '🇮🇳',
  AU: '🇦🇺',
  FR: '🇫🇷',
  CA: '🇨🇦',
  JP: '🇯🇵',
  BR: '🇧🇷',
  NL: '🇳🇱'
}

export function flagFor(cc: string | null): string {
  return cc ? FLAG[cc.toUpperCase()] ?? '🌐' : ''
}
