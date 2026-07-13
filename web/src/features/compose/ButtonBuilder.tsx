import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ButtonGrid } from '@/lib/types';

interface Props {
  value: ButtonGrid;
  onChange: (v: ButtonGrid) => void;
}

// Inline (URL) buton grid'i — satır = yatay buton dizisi.
export function ButtonBuilder({ value, onChange }: Props) {
  function addRow() {
    onChange([...value, [{ text: '', url: '' }]]);
  }
  function updateBtn(rowIdx: number, btnIdx: number, field: 'text' | 'url', v: string) {
    onChange(
      value.map((row, ri) =>
        ri === rowIdx ? row.map((b, bi) => (bi === btnIdx ? { ...b, [field]: v } : b)) : row,
      ),
    );
  }
  function addBtnToRow(rowIdx: number) {
    onChange(value.map((row, ri) => (ri === rowIdx ? [...row, { text: '', url: '' }] : row)));
  }
  function removeBtn(rowIdx: number, btnIdx: number) {
    onChange(
      value
        .map((row, ri) => (ri === rowIdx ? row.filter((_, bi) => bi !== btnIdx) : row))
        .filter((row) => row.length > 0),
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Inline Butonlar</Label>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Satır Ekle
        </Button>
      </div>
      <div className="space-y-2">
        {value.map((row, ri) => (
          <div key={ri} className="rounded-md border bg-muted/30 p-2">
            {row.map((btn, bi) => (
              <div key={bi} className="mb-1 flex gap-2 last:mb-0">
                <Input placeholder="Buton metni" value={btn.text} onChange={(e) => updateBtn(ri, bi, 'text', e.target.value)} />
                <Input placeholder="https://example.com" value={btn.url} onChange={(e) => updateBtn(ri, bi, 'url', e.target.value)} />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeBtn(ri, bi)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 text-xs" onClick={() => addBtnToRow(ri)}>
              + Aynı satıra buton
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
