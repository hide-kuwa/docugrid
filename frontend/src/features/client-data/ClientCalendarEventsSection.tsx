"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, Loader2 } from "lucide-react";
import { SsotEditToolbar } from "@/features/client-data/components/SsotEditToolbar";
import { useSsotEditSession } from "@/features/client-data/hooks/use-ssot-edit-session";
import {
  fetchCalendarEvents,
  upsertCalendarEvent,
  type CalendarEvent,
} from "@/features/client-data/lib/client-calendar-api";

type Props = {
  clientId: string;
  canEdit?: boolean;
};

export function ClientCalendarEventsSection({ clientId, canEdit }: Props) {
  const [committed, setCommitted] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const edit = useSsotEditSession(committed);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setCommitted(await fetchCalendarEvents(clientId));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCommit = async () => {
    setSaving(true);
    try {
      await Promise.all(
        edit.draft.map((ev) =>
          upsertCalendarEvent(clientId, {
            ...ev,
            id: ev.id.startsWith("new-") ? undefined : ev.id,
          }),
        ),
      );
      await reload();
      edit.finishEdit();
    } finally {
      setSaving(false);
    }
  };

  const events = edit.value;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Calendar className="h-4 w-4 text-violet-600" />
            経費突合用カレンダー（SSOT）
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            キャプチャ経費の商談突合に使用。「変更」→「決定」で保存します。
          </p>
        </div>
        <SsotEditToolbar
          isEditing={edit.isEditing}
          canEdit={canEdit}
          saving={saving}
          onStart={edit.startEdit}
          onCommit={() => void handleCommit()}
          onCancel={edit.cancelEdit}
        />
      </div>
      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          読み込み中…
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {events.map((ev) => (
            <li
              key={ev.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2"
            >
              <span className="text-[10px] font-bold text-slate-500">{ev.date}</span>
              <span className="min-w-0 flex-1 text-xs font-medium text-slate-800">{ev.title}</span>
              {edit.isEditing ? (
                <label className="flex items-center gap-1 text-[10px] text-slate-600">
                  人数
                  <input
                    type="number"
                    min={1}
                    className="w-12 rounded border border-violet-200 px-1 py-0.5 text-xs"
                    value={ev.attendees}
                    onChange={(e) =>
                      edit.patchDraft((prev) =>
                        prev.map((p) =>
                          p.id === ev.id ? { ...p, attendees: Number(e.target.value) || 1 } : p,
                        ),
                      )
                    }
                  />
                </label>
              ) : (
                <span className="text-[10px] text-slate-500">{ev.attendees}名</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
