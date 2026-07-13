import { Bold, Italic, Underline, Strikethrough, Code, EyeOff, Link as LinkIcon, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const FORMAT_BTNS = [
  { tag: 'b', icon: Bold, title: 'Kalın' },
  { tag: 'i', icon: Italic, title: 'İtalik' },
  { tag: 'u', icon: Underline, title: 'Altı çizili' },
  { tag: 's', icon: Strikethrough, title: 'Üstü çizili' },
  { tag: 'code', icon: Code, title: 'Kod' },
  { tag: 'tg-spoiler', icon: EyeOff, title: 'Spoiler' },
];

const QUICK_EMOJIS = ['🎰', '🎁', '💰', '⚽', '🔥', '✅', '🚀', '💎', '🏆', '🎯', '⚡', '🎊'];

interface Props {
  onWrap: (tag: string) => void;
  onLink: () => void;
  onPremiumEmoji: () => void;
  onEmoji: (e: string) => void;
}

// HTML formatlama + emoji araç çubuğu (metin manipülasyonu parent'ta, burada sadece tetikleyiciler).
export function RichTextToolbar({ onWrap, onLink, onPremiumEmoji, onEmoji }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1">
      {FORMAT_BTNS.map(({ tag, icon: Icon, title }) => (
        <Button key={tag} type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title={title} onClick={() => onWrap(tag)}>
          <Icon className="h-3.5 w-3.5" />
        </Button>
      ))}
      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title="Link" onClick={onLink}>
        <LinkIcon className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-purple-400" title="Premium Emoji" onClick={onPremiumEmoji}>
        <Sparkles className="h-3.5 w-3.5" />
      </Button>
      <Separator orientation="vertical" className="mx-1 h-5" />
      {QUICK_EMOJIS.map((e) => (
        <Button key={e} type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-base" onClick={() => onEmoji(e)}>
          {e}
        </Button>
      ))}
    </div>
  );
}
