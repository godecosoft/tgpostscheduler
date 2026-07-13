import { useRef, useState } from 'react';
import { ImageIcon, Layers, Film, Sparkles, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { ComposeDraft, MediaType, MediaGroupItem, UploadResult } from '@/lib/types';

type UpdateFn = <K extends keyof ComposeDraft>(key: K, value: ComposeDraft[K]) => void;

interface Props {
  draft: ComposeDraft;
  update: UpdateFn;
}

// Tekli medya / albüm yükleme (drag-drop + butonlar) + medya tipi seçici + önizleme.
export function MediaUploader({ draft, update }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const multiFileRef = useRef<HTMLInputElement>(null);

  async function handleSingleUpload(file: File) {
    try {
      const r = await api.upload<UploadResult>('/api/posts/upload', file);
      update('photo_path', r.path);
      update('photo_url', r.url);
      update('media_type', r.media_type);
      update('media_group', []);
      const labels: Record<string, string> = {
        photo: '📷 Foto', video: '🎬 Video', animation: '🎞️ GIF',
        sticker: '✨ Sticker', document: '📄 Dosya', audio: '🎵 Ses',
      };
      toast.success(`Yüklendi: ${labels[r.media_type] || r.media_type}`, {
        description: 'Yanlış algılandıysa aşağıdan medya tipini değiştirebilirsin.',
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleMultiUpload(files: FileList) {
    const fd = new FormData();
    Array.from(files).slice(0, 10).forEach((f) => fd.append('files', f));
    try {
      const r = await fetch('/api/posts/upload-multi', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Yükleme hatası');
      const items: MediaGroupItem[] = data.files.map((f: UploadResult) => ({
        type: f.media_type === 'video' ? 'video' : 'photo',
        path: f.path,
        url: f.url,
      }));
      update('media_group', [...draft.media_group, ...items].slice(0, 10));
      update('media_type', 'media_group');
      update('photo_path', null);
      update('photo_url', null);
      toast.success(`${items.length} dosya albüme eklendi`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function clearMedia() {
    update('photo_path', null);
    update('photo_url', null);
    update('media_group', []);
    update('media_type', 'text');
  }

  function removeFromGroup(idx: number) {
    const next = draft.media_group.filter((_, i) => i !== idx);
    update('media_group', next);
    if (next.length === 0) update('media_type', 'text');
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function handleDragLeave() {
    setDragOver(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    if (files.length === 1) handleSingleUpload(files[0]);
    else handleMultiUpload(files);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Medya</Label>
        <div className="flex gap-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,video/*,.gif,.webp,.tgs,.mp4,.mov,application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleSingleUpload(f);
              e.target.value = ''; // aynı dosyayı tekrar seçebilmek için reset
            }}
          />
          <input
            ref={multiFileRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/*"
            hidden
            onChange={(e) => {
              if (e.target.files) handleMultiUpload(e.target.files);
              e.target.value = '';
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <ImageIcon className="mr-1 h-3.5 w-3.5" /> Tekli
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => multiFileRef.current?.click()}>
            <Layers className="mr-1 h-3.5 w-3.5" /> Albüm
          </Button>
        </div>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={
          'rounded-md border-2 border-dashed p-3 text-center text-xs text-muted-foreground transition ' +
          (dragOver ? 'border-primary bg-primary/10' : 'border-muted')
        }
      >
        {!draft.photo_url && draft.media_group.length === 0 && (
          <span>📥 Sürükle-bırak ile foto/video/GIF yükle • veya yukarıdaki butonları kullan</span>
        )}
        {draft.photo_url && (
          <div className="space-y-2 text-left">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {draft.media_type === 'video' ? (
                  <Film className="h-4 w-4 text-blue-400" />
                ) : draft.media_type === 'animation' ? (
                  <Film className="h-4 w-4 text-purple-400" />
                ) : draft.media_type === 'sticker' ? (
                  <Sparkles className="h-4 w-4 text-amber-400" />
                ) : draft.media_type === 'document' ? (
                  <FileText className="h-4 w-4" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-emerald-400" />
                )}
                <span className="truncate text-xs">{draft.photo_path}</span>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={clearMedia}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[11px] text-muted-foreground">Telegram'a şu olarak gönder:</Label>
              <Select
                value={draft.media_type}
                onValueChange={(v) => update('media_type', v as MediaType)}
              >
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="photo">📷 Foto (sıkıştırılmış)</SelectItem>
                  <SelectItem value="video">🎬 Video</SelectItem>
                  <SelectItem value="animation">🎞️ GIF / Animasyon</SelectItem>
                  <SelectItem value="sticker">✨ Sticker</SelectItem>
                  <SelectItem value="document">📄 Dosya (orijinal kalite)</SelectItem>
                  <SelectItem value="audio">🎵 Ses</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] text-muted-foreground">
                Yanlış algılandıysa değiştir
              </span>
            </div>
          </div>
        )}
        {draft.media_group.length > 0 && (
          <div className="space-y-1 text-left">
            <div className="flex items-center gap-2 text-foreground">
              <Layers className="h-4 w-4" />
              <span className="text-xs font-medium">
                Albüm — {draft.media_group.length} öğe (max 10)
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1 sm:grid-cols-8">
              {draft.media_group.map((m, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded">
                  {m.type === 'video' ? (
                    <video src={m.url} className="h-full w-full object-cover" muted />
                  ) : (
                    <img src={m.url} className="h-full w-full object-cover" alt="" />
                  )}
                  <button
                    onClick={() => removeFromGroup(i)}
                    className="absolute right-0.5 top-0.5 hidden rounded bg-black/60 p-0.5 group-hover:block"
                    type="button"
                  >
                    <Trash2 className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={clearMedia}>
              <Trash2 className="mr-1 h-3 w-3" /> Albümü temizle
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
