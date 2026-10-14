import React, { useMemo } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useIptvStore } from '../store/useIptvStore'
import { UNIVERSES, categoryLabel, categoryUniverse } from '../services/categoryService'

/** Bouquets du direct rangés par univers, chacun masquable (pays jamais regardés, etc.). */
export const CategorySettings: React.FC = () => {
  const allCategories = useIptvStore((s) => s.allCategories)
  const categoryCounts = useIptvStore((s) => s.categoryCounts)
  const hiddenCategories = useIptvStore((s) => s.hiddenCategories)
  const setCategoriesHidden = useIptvStore((s) => s.setCategoriesHidden)
  const hidden = useMemo(() => new Set(hiddenCategories), [hiddenCategories])

  const groups = useMemo(
    () =>
      UNIVERSES.map((u) => ({ ...u, categories: allCategories.filter((c) => categoryUniverse(c) === u.id) })).filter(
        (g) => g.categories.length > 0
      ),
    [allCategories]
  )

  if (allCategories.length === 0) {
    return <p className="text-sm text-fog">Les bouquets apparaîtront ici une fois la source chargée.</p>
  }

  return (
    <div className="space-y-8">
      {groups.map((g) => {
        const hiddenCount = g.categories.filter((c) => hidden.has(c)).length
        const allHidden = hiddenCount === g.categories.length
        return (
          <div key={g.id}>
            <div className="flex items-center gap-4">
              <h3 className="font-wide text-lg font-bold">{g.label}</h3>
              <span className="font-mono text-xs text-fog tabular">
                {g.categories.length - hiddenCount} / {g.categories.length} affichés
              </span>
              <button
                type="button"
                onClick={() => setCategoriesHidden(g.categories, !allHidden)}
                className="ml-auto rounded-lg px-3 py-1.5 text-sm font-semibold text-mist hover:bg-white/6 hover:text-paper"
              >
                {allHidden ? 'Tout afficher' : 'Tout masquer'}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {g.categories.map((cat) => {
                const isHidden = hidden.has(cat)
                return (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={!isHidden}
                    onClick={() => setCategoriesHidden([cat], !isHidden)}
                    className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
                      isHidden ? 'bg-ink-900 text-fog line-through ring-1 ring-white/6' : 'bg-ink-800 text-paper hover:bg-ink-700'
                    }`}
                  >
                    {isHidden ? <EyeOff className="size-4" /> : <Eye className="size-4 text-accent" />}
                    {categoryLabel(cat)}
                    <span className="font-mono text-xs text-fog tabular">{categoryCounts[cat] || 0}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
