import { Check, MonitorSmartphone } from 'lucide-react';
import { THEMES, type Theme, type ThemeChoice } from '@/lib/themes';

/**
 * Een thema kiezen doe je met je ogen, niet door namen te lezen. Elke knop toont
 * daarom een miniatuur van de app in dat thema: achtergrond, balk, accent en de
 * drie tekstkleuren die je overal terugziet.
 */

function Preview({ theme }: { theme: Theme }) {
  const c = theme.colors;
  return (
    <span className="themecard__preview" style={{ background: c.bg, borderColor: c.border }}>
      <span className="themecard__bar" style={{ background: c.surface, borderColor: c.border }}>
        <span className="themecard__dot" style={{ background: c.accent }} />
        <span className="themecard__dot" style={{ background: c.done }} />
        <span className="themecard__dot" style={{ background: c.doing }} />
      </span>
      <span className="themecard__body">
        <span className="themecard__line" style={{ background: c.text, width: '72%' }} />
        <span className="themecard__line" style={{ background: c.textMuted, width: '54%' }} />
        <span className="themecard__line" style={{ background: c.textDim, width: '38%' }} />
      </span>
    </span>
  );
}

/** Volgt het systeem: half donker, half licht, zodat de knop zichzelf uitlegt. */
function SystemPreview() {
  const dark = THEMES.find((theme) => theme.id === 'dark') ?? THEMES[0];
  const light = THEMES.find((theme) => !theme.dark) ?? THEMES[0];
  return (
    <span className="themecard__preview themecard__preview--split" style={{ borderColor: dark.colors.border }}>
      <span style={{ background: dark.colors.bg }}>
        <span className="themecard__line" style={{ background: dark.colors.text, width: '66%' }} />
        <span className="themecard__line" style={{ background: dark.colors.textDim, width: '44%' }} />
      </span>
      <span style={{ background: light.colors.bg }}>
        <span className="themecard__line" style={{ background: light.colors.text, width: '66%' }} />
        <span className="themecard__line" style={{ background: light.colors.textDim, width: '44%' }} />
      </span>
      <MonitorSmartphone className="themecard__systemicon" size={15} />
    </span>
  );
}

interface Option {
  id: ThemeChoice;
  name: string;
  description: string;
  preview: JSX.Element;
}

export function ThemePicker({
  value,
  onChange,
}: {
  value: ThemeChoice;
  onChange(theme: ThemeChoice): void;
}) {
  const options: Option[] = [
    ...THEMES.map((theme) => ({
      id: theme.id,
      name: theme.name,
      description: theme.description,
      preview: <Preview theme={theme} />,
    })),
    {
      id: 'system',
      name: 'Volg het systeem',
      description: 'Donker of licht, wat je computer op dat moment gebruikt.',
      preview: <SystemPreview />,
    },
  ];

  return (
    <div className="themegrid" role="radiogroup" aria-label="Thema">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={`themecard${active ? ' themecard--active' : ''}`}
            onClick={() => onChange(option.id)}
          >
            {option.preview}
            <span className="themecard__name">
              {option.name}
              {active && <Check size={14} strokeWidth={3} />}
            </span>
            <span className="themecard__description">{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}
