"use client";

import { useMemo, useState } from "react";
import { matchesSearchQuery } from "@/lib/japanese-search";

export type ClientSearchOption = {
  id: string;
  name: string;
  /** 顧客名かななど（任意） */
  nameKana?: string;
};

export function toClientSearchOption(c: {
  id: string;
  name: string;
  nameKana?: string;
  profile?: Record<string, string>;
}): ClientSearchOption {
  return {
    id: c.id,
    name: c.name,
    nameKana:
      (c.nameKana ?? "").trim() ||
      (c.profile?.customer_name_kana ?? "").trim() ||
      undefined,
  };
}

type Props = {
  clients: ClientSearchOption[];
  value: string;
  onChange: (clientId: string) => void;
  /** 空選択時のラベル。省略時は空オプションなし */
  emptyLabel?: string;
  /** 空オプションを出す（emptyLabel 指定時は自動で true） */
  allowEmpty?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  selectClassName?: string;
  searchClassName?: string;
  /** 選択肢の表示をカスタム（既定: 名前 + かな） */
  formatOption?: (client: ClientSearchOption) => string;
  id?: string;
  name?: string;
};

function defaultFormat(client: ClientSearchOption): string {
  const kana = (client.nameKana ?? "").trim();
  return kana ? `${client.name} ${kana}` : client.name;
}

function searchHaystack(client: ClientSearchOption): string {
  return `${client.name} ${client.id} ${client.nameKana ?? ""}`;
}

/** 顧問先ドロップダウン共通（名前・かな・ID で絞り込み） */
export function ClientSearchSelect({
  clients,
  value,
  onChange,
  emptyLabel,
  allowEmpty = emptyLabel !== undefined,
  placeholder = "名前・かなで検索",
  disabled = false,
  className = "",
  selectClassName = "mt-0.5 block w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs",
  searchClassName = "mt-0.5 block w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs",
  formatOption = defaultFormat,
  id,
  name,
}: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    return clients.filter((c) => matchesSearchQuery(searchHaystack(c), query));
  }, [clients, query]);

  const selected = clients.find((c) => c.id === value);

  return (
    <div className={className}>
      <input
        type="search"
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className={searchClassName}
        autoComplete="off"
      />
      <select
        id={id}
        name={name}
        disabled={disabled}
        className={selectClassName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowEmpty ? <option value="">{emptyLabel ?? "選択…"}</option> : null}
        {filtered.map((c) => (
          <option key={c.id} value={c.id}>
            {formatOption(c)}
          </option>
        ))}
        {value && selected && !filtered.some((c) => c.id === value) ? (
          <option value={value}>{formatOption(selected)}</option>
        ) : null}
      </select>
      {query.trim() && filtered.length === 0 ? (
        <span className="mt-0.5 block text-[10px] text-amber-700">該当なし</span>
      ) : null}
    </div>
  );
}
