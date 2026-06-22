import { Skeleton } from "./skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

export interface DataTableSkeletonProps {
  rowCount?: number;
  columnCount?: number;
  showHeader?: boolean;
}

export function DataTableSkeleton({
  rowCount = 10,
  columnCount = 5,
  showHeader = true,
}: DataTableSkeletonProps) {
  return (
    <Table>
      {showHeader && (
        <TableHeader>
          <TableRow>
            {Array.from({ length: columnCount }).map((_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-5 w-full" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
      )}
      <TableBody>
        {Array.from({ length: rowCount }).map((_, i) => (
          <TableRow key={i}>
            {Array.from({ length: columnCount }).map((_, j) => (
              <TableCell key={j}>
                <Skeleton className="h-5 w-full" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
