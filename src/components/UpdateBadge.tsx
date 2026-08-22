import { Download, RefreshCw, RotateCw } from 'lucide-react';
import { IS_DESKTOP } from '@/lib/platform';
import { useUpdate } from '@/store/updateStore';

/**
 * De knop in de balk. Verschijnt alleen als er werkelijk iets te doen is, zodat
 * hij niet in de weg zit; de volledige uitleg staat bij Instellingen.
 */
export function UpdateBadge() {
  const state = useUpdate((store) => store.state);
  const install = useUpdate((store) => store.install);

  if (state.kind === 'downloading') {
    return (
      <span className="updatebadge updatebadge--busy" title="De nieuwe versie wordt opgehaald">
        <RefreshCw size={13} style={{ animation: 'spin 0.9s linear infinite' }} />
        {state.percent}%
      </span>
    );
  }

  if (state.kind === 'ready') {
    return (
      <button
        type="button"
        className="updatebadge updatebadge--ready"
        onClick={install}
        title={`Versie ${state.version} is opgehaald en wordt bij het herstarten geïnstalleerd`}
      >
        <RotateCw size={13} /> Herstarten voor {state.version}
      </button>
    );
  }

  if (state.kind === 'available') {
    // Op de desktop haalt de updater hem zelf op; dit is dan alleen een melding.
    return (
      <button
        type="button"
        className="updatebadge updatebadge--ready"
        onClick={install}
        disabled={IS_DESKTOP}
        title={`Versie ${state.version} staat klaar`}
      >
        <Download size={13} /> {IS_DESKTOP ? `${state.version} wordt opgehaald` : `Versie ${state.version}`}
      </button>
    );
  }

  return null;
}
