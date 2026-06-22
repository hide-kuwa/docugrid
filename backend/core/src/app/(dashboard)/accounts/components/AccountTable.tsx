"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../../components/ui/table";

export type Account = {
  code: string;
  name: string;
  category: string;
};

interface AccountTableProps {
  accounts: Account[];
  isLoading: boolean;
  error: string | null;
}

export function AccountTable({
  accounts,
  isLoading,
  error,
}: AccountTableProps) {
  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-gray-500">
        読み込み中です…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-red-200 bg-red-50 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-gray-500">
        登録されている勘定科目がありません。
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40">科目コード</TableHead>
            <TableHead>科目名</TableHead>
            <TableHead>区分</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.code}>
              <TableCell className="font-mono font-semibold">
                {account.code}
              </TableCell>
              <TableCell>{account.name}</TableCell>
              <TableCell>{account.category}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
