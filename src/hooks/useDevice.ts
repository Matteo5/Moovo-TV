import { useEffect, useState } from 'react'
import type { DeviceMode, DeviceModePreference } from '../types/iptv'
import { isNativeTelevision } from '../native'

const TV_USER_AGENT =
  /Android TV|GoogleTV|AFT[A-Z]|BRAVIA|SmartTV|SMART-TV|Tizen|Web0S|webOS|HbbTV|CrKey|Philips|NetCast|Roku|MiTV|Vidaa/i

function detect(): DeviceMode {
  const params = new URLSearchParams(location.search)
  const forced = params.get('device')
  if (forced === 'tv' || forced === 'desktop' || forced === 'mobile') return forced

  if (isNativeTelevision() || TV_USER_AGENT.test(navigator.userAgent)) return 'tv'
  // Écran sans pointeur (télécommande seule)
  if (matchMedia('(pointer: none)').matches && matchMedia('(min-width: 900px)').matches) return 'tv'
  if (matchMedia('(max-width: 767px)').matches || (matchMedia('(pointer: coarse)').matches && matchMedia('(max-width: 1023px)').matches)) {
    return 'mobile'
  }
  return 'desktop'
}

/**
 * Mode d'affichage : TV (télécommande, lecture à distance), desktop (souris/clavier) ou mobile (tactile).
 * Posé sur <html data-device> pour que toute l'échelle typographique s'adapte.
 */
export function useDeviceMode(preference: DeviceModePreference): DeviceMode {
  const [auto, setAuto] = useState<DeviceMode>(() => detect())

  useEffect(() => {
    const onResize = () => setAuto(detect())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const mode = preference === 'auto' ? auto : preference

  useEffect(() => {
    document.documentElement.dataset.device = mode
  }, [mode])

  return mode
}
