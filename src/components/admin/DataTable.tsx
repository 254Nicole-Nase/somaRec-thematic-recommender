import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "../ui/utils";

export type SortDirection = "asc" | "desc" | null;

export interface Column<T> {
  id: string;
  header: string;
  accessorKey?: keyof T;
  accessorFn?: (row: T) => React.ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  cell?: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selectedRows?: Set<string>;
  onSelectionChange?: (selected: Set<string>) => void;
  getRowId?: (row: T) => string;
  sortBy?: string;
  sortDirection?: SortDirection;
  onSort?: (columnId: string, direction: SortDirection) => void;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  totalCount?: number;
  loading?: boolean;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  onRowClick,
  selectable = false,
  selectedRows = new Set(),
  onSelectionChange,
  getRowId = (row: T) => String(row.id || Math.random()),
  sortBy,
  sortDirection,
  onSort,
  page = 1,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  totalCount,
  loading = false,
  emptyMessage = "No data available",
}: DataTableProps<T>) {
  const [internalPage, setInternalPage] = React.useState(page);
  const [internalPageSize, setInternalPageSize] = React.useState(pageSize);

  // Use controlled or internal state for pagination
  const currentPage = onPageChange ? page : internalPage;
  const currentPageSize = onPageSizeChange ? pageSize : internalPageSize;

  // Calculate pagination
  // Always paginate the data array (totalCount is optional for server-side pagination)
  const totalPages = Math.ceil(data.length / currentPageSize);
  const startIndex = (currentPage - 1) * currentPageSize;
  const endIndex = startIndex + currentPageSize;
  const paginatedData = data.slice(startIndex, endIndex);
  
  // Use totalCount for display if provided, otherwise use data.length
  const displayTotal = totalCount !== undefined ? totalCount : data.length;

  // Handle sorting
  const handleSort = (columnId: string) => {
    if (!onSort || !columns.find((col) => col.id === columnId)?.sortable) {
      return;
    }

    let newDirection: SortDirection = "asc";
    if (sortBy === columnId && sortDirection === "asc") {
      newDirection = "desc";
    } else if (sortBy === columnId && sortDirection === "desc") {
      newDirection = null;
    }

    onSort(columnId, newDirection);
  };

  // Handle row selection
  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange || !selectable) return;
    const newSelection = new Set<string>();
    if (checked) {
      paginatedData.forEach((row) => {
        newSelection.add(getRowId(row));
      });
    }
    onSelectionChange(newSelection);
  };

  const handleSelectRow = (rowId: string, checked: boolean) => {
    if (!onSelectionChange || !selectable) return;
    const newSelection = new Set(selectedRows);
    if (checked) {
      newSelection.add(rowId);
    } else {
      newSelection.delete(rowId);
    }
    onSelectionChange(newSelection);
  };

  const allSelected =
    selectable &&
    paginatedData.length > 0 &&
    paginatedData.every((row) => selectedRows.has(getRowId(row)));
  const someSelected =
    selectable &&
    paginatedData.some((row) => selectedRows.has(getRowId(row)));

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    if (onPageChange) {
      onPageChange(newPage);
    } else {
      setInternalPage(newPage);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    if (onPageSizeChange) {
      onPageSizeChange(newSize);
    } else {
      setInternalPageSize(newSize);
      setInternalPage(1);
    }
  };

  // Get cell value
  const getCellValue = (row: T, column: Column<T>): React.ReactNode => {
    if (column.cell) {
      return column.cell(row);
    }
    if (column.accessorFn) {
      return column.accessorFn(row);
    }
    if (column.accessorKey) {
      return row[column.accessorKey];
    }
    return null;
  };

  // Get sort icon
  const getSortIcon = (columnId: string) => {
    if (sortBy !== columnId || !sortDirection) {
      return <ArrowUpDown className="ml-2 h-4 w-4" />;
    }
    if (sortDirection === "asc") {
      return <ArrowUp className="ml-2 h-4 w-4" />;
    }
    return <ArrowDown className="ml-2 h-4 w-4" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all"
                    className={cn(
                      someSelected && !allSelected && "data-[state=checked]:bg-muted"
                    )}
                  />
                </TableHead>
              )}
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={cn(
                    column.sortable && "cursor-pointer hover:bg-muted/50",
                    "select-none"
                  )}
                  onClick={() => column.sortable && handleSort(column.id)}
                >
                  <div className="flex items-center">
                    {column.header}
                    {column.sortable && getSortIcon(column.id)}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="h-24 text-center"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row) => {
                const rowId = getRowId(row);
                const isSelected = selectedRows.has(rowId);
                return (
                  <TableRow
                    key={rowId}
                    data-state={isSelected && "selected"}
                    className={cn(
                      onRowClick && "cursor-pointer",
                      isSelected && "bg-muted/50"
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <TableCell
                        onClick={(e) => e.stopPropagation()}
                        className="w-12"
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            handleSelectRow(rowId, checked as boolean)
                          }
                          aria-label={`Select row ${rowId}`}
                        />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell key={column.id}>
                        {getCellValue(row, column)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data.length > currentPageSize && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Showing {startIndex + 1} to{" "}
              {Math.min(endIndex, displayTotal)} of{" "}
              {displayTotal} entries
            </span>
            <select
              value={currentPageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

