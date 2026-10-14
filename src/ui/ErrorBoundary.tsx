import React from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: React.ReactNode
  /** Libellé de la zone, pour le message affiché. */
  area: string
  onReset?: () => void
  fullscreen?: boolean
}

interface State {
  error: Error | null
}

/** Empêche une erreur d'affichage de faire tomber toute l'application. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[Moovo TV] Erreur dans ${this.props.area} :`, error, info.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        data-nav-trap
        className={`${this.props.fullscreen ? 'fixed inset-0 z-[80]' : 'min-h-[60vh]'} flex items-center justify-center bg-ink-950 p-6`}
      >
        <div className="max-w-md">
          <AlertTriangle className="size-9 text-brand-yellow" />
          <h2 className="mt-5 font-wide text-2xl font-bold">{this.props.area} a rencontré un problème</h2>
          <p className="mt-3 text-mist">L’affichage a été interrompu. Vos réglages et favoris ne sont pas touchés.</p>
          <p className="mt-3 rounded-xl bg-ink-900 px-4 py-3 font-mono text-xs text-fog">{this.state.error.message}</p>
          <div className="mt-7 flex gap-3">
            <button type="button" onClick={this.reset} data-autofocus className="h-11 rounded-xl bg-accent px-5 font-bold text-accent-ink">
              Revenir
            </button>
            <button type="button" onClick={() => location.reload()} className="h-11 rounded-xl bg-ink-800 px-5 font-semibold text-paper">
              Recharger l’application
            </button>
          </div>
        </div>
      </div>
    )
  }
}
