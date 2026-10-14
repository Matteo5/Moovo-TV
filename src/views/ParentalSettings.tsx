import React, { useMemo, useState } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import { categoryLabel, isAdultCategory } from '../services/categoryService'
import { Button } from '../ui/Button'

/** Contrôle parental : code à 4 chiffres, bouquets verrouillés, films et séries pour adultes. */
export const ParentalSettings: React.FC<{ inputClass: string; onNotice: (message: string) => void }> = ({ inputClass, onNotice }) => {
  const pin = useIptvStore((s) => s.parentalPin)
  const locked = useIptvStore((s) => s.lockedCategories)
  const lockAdultVod = useIptvStore((s) => s.lockAdultVod)
  const allCategories = useIptvStore((s) => s.allCategories)
  const categoryCounts = useIptvStore((s) => s.categoryCounts)
  const setParentalPin = useIptvStore((s) => s.setParentalPin)
  const setCategoriesLocked = useIptvStore((s) => s.setCategoriesLocked)
  const setLockAdultVod = useIptvStore((s) => s.setLockAdultVod)
  const [draft, setDraft] = useState('')
  const [current, setCurrent] = useState('')
  const lockedSet = useMemo(() => new Set(locked), [locked])

  // Bouquets adultes d'abord, puis les autres dans l'ordre du fournisseur
  const ordered = useMemo(
    () => [...allCategories].sort((a, b) => Number(isAdultCategory(b)) - Number(isAdultCategory(a))),
    [allCategories]
  )

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (pin && current !== pin) return onNotice('Le code actuel est incorrect.')
    if (!/^\d{4}$/.test(draft)) return onNotice('Le code doit faire exactement 4 chiffres.')
    setParentalPin(draft)
    setDraft('')
    setCurrent('')
    onNotice(pin ? 'Code parental modifié.' : 'Contrôle parental activé.')
  }

  const disable = () => {
    if (current !== pin) return onNotice('Entrez le code actuel pour désactiver le contrôle parental.')
    setParentalPin('')
    setCurrent('')
    onNotice('Contrôle parental désactivé.')
  }

  return (
    <div>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        {pin && (
          <input
            value={current}
            onChange={(e) => setCurrent(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            type="password"
            autoComplete="off"
            placeholder="Code actuel"
            aria-label="Code actuel"
            className={`${inputClass} font-mono tracking-[0.3em]`}
          />
        )}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          type="password"
          autoComplete="off"
          placeholder={pin ? 'Nouveau code' : 'Choisir un code à 4 chiffres'}
          aria-label="Nouveau code"
          className={`${inputClass} font-mono tracking-[0.3em] ${pin ? '' : 'sm:col-span-2'}`}
        />
        <Button type="submit" icon={<Lock className="size-4" />}>
          {pin ? 'Changer' : 'Activer'}
        </Button>
      </form>
      {pin && (
        <Button className="mt-3" variant="ghost" icon={<LockOpen className="size-4" />} onClick={disable}>
          Désactiver le contrôle parental
        </Button>
      )}

      {pin && (
        <>
          <label className="mt-8 flex cursor-pointer items-center gap-3">
            <input type="checkbox" checked={lockAdultVod} onChange={(e) => setLockAdultVod(e.target.checked)} className="size-5 accent-[var(--accent)]" />
            <span className="text-sm text-mist">Verrouiller aussi les films et séries des catégories pour adultes</span>
          </label>

          <p className="mb-3 mt-8 text-sm text-fog">Bouquets du direct verrouillés : le code est demandé à l’ouverture, le zapping les saute.</p>
          <div className="flex flex-wrap gap-2">
            {ordered.map((cat) => {
              const isLocked = lockedSet.has(cat)
              return (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={isLocked}
                  onClick={() => setCategoriesLocked([cat], !isLocked)}
                  className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
                    isLocked ? 'bg-brand-magenta/20 text-paper ring-1 ring-brand-magenta/50' : 'bg-ink-800 text-mist hover:text-paper'
                  }`}
                >
                  {isLocked ? <Lock className="size-4 text-brand-magenta" /> : <LockOpen className="size-4" />}
                  {categoryLabel(cat)}
                  <span className="font-mono text-xs text-fog tabular">{categoryCounts[cat] || 0}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
