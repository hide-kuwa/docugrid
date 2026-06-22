import * as React from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from './table'
import { exportCsv } from '@/utils/csvExporter'

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[]
  data: TData[]
  fileName?: string
}

export function DataTable<TData>({ columns, data, fileName }: DataTableProps<TData>) {
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [columnVisibility, setColumnVisibility] = React.useState<
    Record<string, boolean>
  >({})

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, columnVisibility },
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const handleExport = () => {
    const headers = table
      .getAllColumns()
      .filter(c => c.getIsVisible())
      .map(c => String(c.columnDef.header))
    const rows = table.getRowModel().rows.map(r =>
      r.getVisibleCells().map(cell => String(cell.getValue()))
    )
    exportCsv(headers, rows, fileName ?? 'table.csv')
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <input
          aria-label="検索"
          className="border rounded px-2 py-1 text-sm"
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          placeholder="フィルタ"
        />
        <div className="flex items-center gap-2">
          {table.getAllLeafColumns().map(col => (
            <label key={col.id} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={col.getIsVisible()}
                onChange={col.getToggleVisibilityHandler()}
              />
              {String(col.columnDef.header)}
            </label>
          ))}
          <button
            type="button"
            onClick={handleExport}
            className="border rounded px-2 py-1 text-sm"
          >
            CSV
          </button>
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
        <TableHeader>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map(row => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map(cell => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
