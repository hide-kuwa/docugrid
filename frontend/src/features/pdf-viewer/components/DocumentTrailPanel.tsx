import { Check, Eye, Stamp } from "lucide-react";
import type { DocumentTrailSummary } from "../lib/document-trail";

type Props = {
  trail: DocumentTrailSummary;
  stampBusy?: boolean;
  alreadyAcknowledged?: boolean;
  alreadyAgreed?: boolean;
  onAcknowledge: () => void;
  onAgree: () => void;
};

export function DocumentTrailPanel({
  trail,
  stampBusy = false,
  alreadyAcknowledged = false,
  alreadyAgreed = false,
  onAcknowledge,
  onAgree,
}: Props) {
  return (
    <div className="space-y-4">
      {trail.isContract ? (
        <div
          className={`rounded-lg border px-3 py-2 ${
            trail.agreement === "agreed"
              ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
              : "border-amber-700 bg-amber-950/50 text-amber-100"
          }`}
        >
          <p className="text-xs font-black">
            {trail.agreement === "agreed" ? "契約済（双方の同意あり）" : "未契約（同意が揃っていません）"}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed opacity-90">
            事務所側: {trail.firmAgreed ? "同意あり" : "未同意"} ／ クライアント側:{" "}
            {trail.clientAgreed ? "同意あり" : "未同意"}
          </p>
          <p className="mt-1 text-[10px] opacity-70">
            電子署名法の署名ではありません。消えない業務記録です。
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={stampBusy || alreadyAcknowledged}
          onClick={onAcknowledge}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-500 bg-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-slate-600 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          {alreadyAcknowledged ? "確認済み" : "確認した"}
        </button>
        <button
          type="button"
          disabled={stampBusy || alreadyAgreed}
          onClick={onAgree}
          className="inline-flex items-center gap-1 rounded-lg border border-violet-500 bg-violet-800 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          <Stamp className="h-3.5 w-3.5" />
          {alreadyAgreed ? "同意済み" : trail.isContract ? "契約に同意した" : "同意した"}
        </button>
      </div>

      <section>
        <h4 className="mb-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
          <Eye className="h-3 w-3" />
          閲覧
        </h4>
        {trail.views.length === 0 ? (
          <p className="text-[11px] text-slate-500">まだ閲覧記録がありません</p>
        ) : (
          <ul className="space-y-1.5">
            {trail.views.map((row) => (
              <li key={row.key} className="text-[11px] text-slate-200">
                <span className="font-bold">{row.actor}</span>
                <span className="text-slate-400"> · {row.role}</span>
                <span className="block text-[10px] text-slate-500">
                  最終 {row.lastAtLabel}
                  {row.opens > 1 ? ` · ${row.opens} 回` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
          <Stamp className="h-3 w-3" />
          確認・同意・承認
        </h4>
        {trail.stamps.length === 0 ? (
          <p className="text-[11px] text-slate-500">まだスタンプがありません</p>
        ) : (
          <ul className="space-y-1.5">
            {trail.stamps.map((row) => (
              <li key={row.id} className="text-[11px] text-slate-200">
                <span className="font-bold">{row.label}</span>
                <span className="text-slate-400">
                  {" "}
                  · {row.actor}（{row.role}）
                </span>
                <span className="block text-[10px] text-slate-500">{row.atLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
